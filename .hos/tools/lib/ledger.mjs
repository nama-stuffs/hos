// The in-repo ticket Ledger: the local file-backed tracker. Each ticket is a
// directory under .hos/tickets/ with a markdown record, an execution plan, and an
// append-only journey of everything that happened.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKETS_DIR, TICKETS_INDEX } from "./paths.mjs";
import { nowIso, slugify, today, writeFileAtomic } from "./util.mjs";

// Terminal statuses: a ticket here needs no more work and is never claimable.
const TERMINAL = ["verified", "superseded", "duplicate"];

// The retrospective decision taxonomy. See doc/protocol/retrospective.md.
export const RETRO_OUTCOMES = [
    "no-op", "memory-policy", "spec-update", "protocol-update",
    "bench-scenario", "test-tooling", "follow-up", "contribution-candidate"
];
import { settings } from "./config.mjs";
import * as fm from "./frontmatter.mjs";

function prefix() {
    return settings().tickets?.prefix || "T";
}

function ticketDirs() {
    return existsSync(TICKETS_DIR)
        ? readdirSync(TICKETS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
        : [];
}

function newId(title) {
    const base = `${prefix()}-${today()}-${slugify(title) || "ticket"}`;
    if (!existsSync(join(TICKETS_DIR, base))) {
        return base;
    }

    let n = 2;
    while (existsSync(join(TICKETS_DIR, `${base}-${n}`))) {
        n++;
    }
    return `${base}-${n}`;
}

function dirOf(id) {
    return join(TICKETS_DIR, id);
}

function claimPath(id) {
    return join(dirOf(id), "claim.json");
}

function logDir(id) {
    return join(dirOf(id), "log");
}

// A claim older than this is reclaimable, so a dead or hung worker never wedges a
// ticket. Configurable in hos.json under parallel.claimTtlMinutes.
function claimTtlMinutes() {
    return settings().parallel?.claimTtlMinutes ?? 30;
}

function claimAgeMinutes(claim) {
    return claim?.at ? (Date.now() - new Date(claim.at).getTime()) / 60000 : Infinity;
}

function claimIsStale(claim) {
    return claimAgeMinutes(claim) >= claimTtlMinutes();
}

function read(id) {
    return fm.parse(readFileSync(join(dirOf(id), "ticket.md"), "utf8"));
}

function writePlan(id, actor) {
    const plan = {
        ticket: id,
        lifecycle: {
            intake: "inter",
            planning: "alpha",
            execution: actor || "",
            verification: "",
            closure: "alpha",
            retrospective: "alpha"
        },
        steps: []
    };
    writeFileSync(join(dirOf(id), "plan.json"), JSON.stringify(plan, null, 2) + "\n");
}

// Create a ticket. Returns { id, dir }. actor is "base+lens+lens" (base first).
export function create({ title, report = "", acceptance = "", actor = "", labels = [] }) {
    const id = newId(title);
    const dir = dirOf(id);
    mkdirSync(join(dir, "evidence"), { recursive: true });

    const data = {
        id, title, status: "reported", actor,
        parent: "", blocks: [], blockedBy: [], duplicateOf: "", labels,
        created: today(), updated: today()
    };
    const body = [
        "## Report", "", report || "_(original request)_", "",
        "## Acceptance", "", acceptance || "_(define before marking fixed)_", "",
        "## Elements", "", "- [ ] _(break the work into checkable items)_", ""
    ].join("\n");

    writeFileSync(join(dir, "ticket.md"), fm.serialize(data, body));
    writePlan(id, actor);
    journey(id, { actor: "inter", kind: "intake", summary: title });
    rebuildIndex();
    return { id, dir };
}

// Append one event to the ticket's journey (the full trace for the report).
export function journey(id, { actor = "", kind = "note", summary = "", ref = "" }) {
    appendFileSync(join(dirOf(id), "journey.ndjson"), JSON.stringify({ ts: nowIso(), actor, kind, summary, ref }) + "\n");
}

export function list() {
    return ticketDirs().map((id) => {
        const { data } = read(id);
        const claim = claimOf(data.id || id);
        return { id: data.id || id, title: data.title, status: data.status, actor: data.actor, claimedBy: claim?.by || null };
    });
}

// Read a ticket's claim, or null when unclaimed.
export function claimOf(id) {
    const path = claimPath(id);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

// Atomically claim a ticket for one agent. The `wx` flag makes the create fail if
// a claim already exists, so two agents racing for the same ticket resolve to a
// single winner - the mutex that makes parallel dispatch safe. See
// doc/protocol/parallel.md.
export function claim(id, by = "agent") {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    try {
        writeFileSync(claimPath(id), JSON.stringify({ by, at: nowIso() }) + "\n", { flag: "wx" });
    } catch (err) {
        if (err.code === "EEXIST") {
            const current = claimOf(id);
            return { ok: false, id, claimedBy: current?.by || "unknown", at: current?.at };
        }
        throw err;
    }
    journey(id, { actor: by, kind: "claim", summary: `claimed by ${by}` });
    return { ok: true, id, by };
}

// Release a claim so the ticket can be re-dispatched (after a step fails, once
// integration is done, or to reclaim a stale claim from a dead worker). With
// `stale`, only releases when the claim has aged past the TTL.
export function release(id, { by = "alpha", stale = false } = {}) {
    const claim = claimOf(id);
    if (!claim) {
        return { ok: true, id, released: false };
    }
    if (stale && !claimIsStale(claim)) {
        return { ok: false, id, released: false, reason: "claim is not stale yet" };
    }
    unlinkSync(claimPath(id));
    journey(id, { actor: by, kind: "release", summary: stale ? "released (stale)" : "released", ref: claim.by });
    return { ok: true, id, released: true };
}

// Tickets a sub-agent may pick up now: actionable status, not blocked by a still-
// open dependency, and either unclaimed or holding only a stale claim.
export function claimable() {
    const all = list();
    const statusById = Object.fromEntries(all.map((t) => [t.id, t.status]));
    return all.filter((t) => {
        if (TERMINAL.includes(t.status) || t.status === "blocked") {
            return false;
        }
        const claim = claimOf(t.id);
        if (claim && !claimIsStale(claim)) {
            return false;
        }
        const { data } = read(t.id);
        const blockers = Array.isArray(data.blockedBy) ? data.blockedBy : [];
        return !blockers.some((b) => statusById[b] && !TERMINAL.includes(statusById[b]));
    });
}

// Append a structured event to the ticket journey - the curated surface trace
// (decisions, notes, handoffs). Bulk command output goes to the deep log, not
// here, so the surface stays terse.
export function log(id, { kind = "note", summary = "", by = "", ref = "" } = {}) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    journey(id, { actor: by, kind, summary, ref });
    return { ok: true, id, kind };
}

// Deep log: persist a captured command. Full output lands in a .out file, indexed
// in runs.ndjson. This is the agent-agnostic, automatic capture point - workers
// run commands through `hos run <id>`, so the thread is recorded without scraping
// any agent's private transcript.
export function recordRun(id, { cmd = "", exit = 0, durationMs = 0, output = "", actor = "" } = {}) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    mkdirSync(logDir(id), { recursive: true });
    const seq = readdirSync(logDir(id)).filter((f) => /^run-\d+\.out$/.test(f)).length + 1;
    const outFile = `run-${String(seq).padStart(3, "0")}.out`;
    writeFileSync(join(logDir(id), outFile), output);
    appendFileSync(
        join(logDir(id), "runs.ndjson"),
        JSON.stringify({ ts: nowIso(), actor, cmd, exit, durationMs, out: outFile }) + "\n"
    );
    return { ok: true, id, seq, out: join(logDir(id), outFile).replaceAll("\\", "/") };
}

export function runs(id) {
    const path = join(logDir(id), "runs.ndjson");
    return existsSync(path)
        ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
        : [];
}

// The complete deep thread for one ticket: surface record, structured journey,
// captured command runs, and evidence. This is what the retrospective reads.
export function thread(id) {
    const { data, body, journey: events } = show(id);
    const evidenceDir = join(dirOf(id), "evidence");
    const evidence = existsSync(evidenceDir) ? readdirSync(evidenceDir) : [];
    return { id: data.id || id, surface: { data, body }, journey: events, runs: runs(id), evidence };
}

export function show(id) {
    const { data, body } = read(id);
    const path = join(dirOf(id), "journey.ndjson");
    const events = existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { data, body, journey: events };
}

// Move a ticket to a new canonical status (see task.md) and log it.
export function move(id, status, note = "") {
    const { data, body } = read(id);
    data.status = status;
    data.updated = today();
    writeFileSync(join(dirOf(id), "ticket.md"), fm.serialize(data, body));
    journey(id, { actor: "alpha", kind: "status", summary: `-> ${status}${note ? `: ${note}` : ""}`, ref: status });
    rebuildIndex();
    return { id, status };
}

// Record a verification attempt as a structured event so metrics need not parse
// free text. See doc/protocol/testing.md.
export function verify(id, { result = "pass", note = "", by = "tester" } = {}) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    if (!["pass", "fail"].includes(result)) {
        throw new Error("verify result must be pass or fail");
    }
    journey(id, { actor: by, kind: "verify", summary: `${result}${note ? `: ${note}` : ""}`, ref: result });
    return { ok: true, id, result };
}

// Record a retrospective decision (one or more taxonomy outcomes) as a structured
// event. See doc/protocol/retrospective.md.
export function retro(id, { outcomes = [], by = "optimizer", note = "", ref = "" } = {}) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    const list = outcomes.map((o) => o.trim()).filter(Boolean);
    if (!list.length) {
        throw new Error(`retro needs --outcome (one of: ${RETRO_OUTCOMES.join(", ")})`);
    }
    const bad = list.filter((o) => !RETRO_OUTCOMES.includes(o));
    if (bad.length) {
        throw new Error(`unknown retro outcome(s): ${bad.join(", ")} (one of: ${RETRO_OUTCOMES.join(", ")})`);
    }
    journey(id, { actor: by, kind: "retro", summary: `${list.join(",")}${note ? `: ${note}` : ""}`, ref });
    return { ok: true, id, outcomes: list, by };
}

function addUnique(list, value) {
    return value && !list.includes(value) ? [...list, value] : list;
}

export function link(id, { parent = "", blocks = "", blockedBy = "", duplicateOf = "" } = {}) {
    const { data, body } = read(id);
    if (parent) {
        data.parent = parent;
    }
    if (blocks) {
        data.blocks = addUnique(Array.isArray(data.blocks) ? data.blocks : [], blocks);
    }
    if (blockedBy) {
        data.blockedBy = addUnique(Array.isArray(data.blockedBy) ? data.blockedBy : [], blockedBy);
    }
    if (duplicateOf) {
        data.duplicateOf = duplicateOf;
        data.status = "duplicate";
    }
    data.updated = today();
    writeFileSync(join(dirOf(id), "ticket.md"), fm.serialize(data, body));
    journey(id, { actor: "alpha", kind: "relation", summary: JSON.stringify({ parent, blocks, blockedBy, duplicateOf }) });
    rebuildIndex();
    return { id, parent: data.parent, blocks: data.blocks, blockedBy: data.blockedBy, duplicateOf: data.duplicateOf, status: data.status };
}

// Generate a full journey report in markdown.
export function report(id) {
    const { data, body, journey: events } = show(id);
    const lines = events.map((e) => `- \`${e.ts}\` **${e.actor || "-"}** - ${e.kind}: ${e.summary}${e.ref ? ` (${e.ref})` : ""}`);
    const out = [
        `# Ticket ${data.id} - ${data.title}`, "",
        `Status: **${data.status}** - Actor: \`${data.actor || "-"}\` - Created: ${data.created}`, "",
        body, "", "## Journey", "", ...(lines.length ? lines : ["_(no events yet)_"]), ""
    ].join("\n");
    const path = join(dirOf(id), "report.md");
    writeFileSync(path, out);
    return path;
}

export function rebuildIndex() {
    mkdirSync(TICKETS_DIR, { recursive: true });
    const rows = list().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        .map((t) => `| ${t.id} | ${t.title} | ${t.status} | \`${t.actor || "-"}\` | ${t.claimedBy ? `\`${t.claimedBy}\`` : "-"} |`);
    const out = [
        "# Ticket Ledger", "",
        "The in-repo tracker. Generated by `hos ticket index` -- do not edit by",
        "hand. See `.hos/doc/protocol/task.md`.", "",
        "| ID | Title | Status | Actor | Claim |", "| -- | ----- | ------ | ----- | ----- |",
        ...(rows.length ? rows : ["| - | _none yet_ | - | - | - |"]), ""
    ].join("\n");
    writeFileAtomic(TICKETS_INDEX, out);
    return TICKETS_INDEX;
}
