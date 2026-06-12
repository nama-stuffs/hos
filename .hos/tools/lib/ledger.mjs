// The in-repo ticket Ledger: the local file-backed tracker. Each ticket is a
// directory under .hos/tickets/ with a markdown record, an execution plan, and an
// append-only journey of everything that happened.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKETS_DIR, TICKETS_INDEX } from "./paths.mjs";
import { nowIso, slugify, today, tokenize, writeFileAtomic } from "./util.mjs";

// The canonical status model (doc/protocol/task.md). A move outside it is a typo,
// not a new state.
export const STATUSES = ["blocked", "reported", "reproduced", "fixed", "verified", "superseded", "duplicate"];

// Terminal statuses: a ticket here needs no more work and is never claimable.
export const TERMINAL = ["verified", "superseded", "duplicate"];

// The retrospective decision taxonomy. See doc/protocol/retrospective.md.
export const RETRO_OUTCOMES = [
    "no-op", "memory-policy", "spec-update", "protocol-update",
    "bench-scenario", "test-tooling", "follow-up", "contribution-candidate"
];
import { settings } from "./config.mjs";
import { gate as autonomyGate, normalizeLevel } from "./autonomy.mjs";
import { active as activeSession, attach as attachSession, attachedTo } from "./session.mjs";
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

// One-line acceptance with | separators becomes checkbox criteria (the same
// convention as spec add). Windows command lines cannot carry raw newlines, so
// the pipe is the portable way to pass several criteria in one argument;
// already-multiline text is kept as the author formatted it.
function renderAcceptance(acceptance) {
    const text = String(acceptance || "").trim();
    if (!text || text.includes("\n")) {
        return text;
    }
    const parts = text.split("|").map((s) => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts.map((p) => `- [ ] ${p}`).join("\n") : text;
}

// Create a ticket. Returns { id, dir }. actor is "base+lens+lens" (base first).
export function create({ title, report = "", acceptance = "", actor = "", level = "", labels = [] }) {
    const id = newId(title);
    const dir = dirOf(id);
    mkdirSync(join(dir, "evidence"), { recursive: true });

    const data = {
        id, title, status: "reported", actor, level: level ? normalizeLevel(level) : "",
        parent: "", blocks: [], blockedBy: [], duplicateOf: "", labels,
        created: today(), updated: today()
    };
    const body = [
        "## Report", "", report || "_(original request)_", "",
        "## Acceptance", "", renderAcceptance(acceptance) || "_(define before marking fixed)_", "",
        "## Elements", "", "- [ ] _(break the work into checkable items)_", ""
    ].join("\n");

    writeFileSync(join(dir, "ticket.md"), fm.serialize(data, body));
    writePlan(id, actor);
    journey(id, { actor: "inter", kind: "intake", summary: title });
    rebuildIndex();
    return { id, dir };
}

// Append one event to the ticket's journey (the full trace for the report).
export function journey(id, { actor = "", kind = "note", summary = "", ref = "", ...rest }) {
    appendFileSync(join(dirOf(id), "journey.ndjson"), JSON.stringify({ ts: nowIso(), actor, kind, summary, ref, ...rest }) + "\n");
}

export function list() {
    return ticketDirs().map((id) => {
        const { data } = read(id);
        const claim = claimOf(data.id || id);
        return { id: data.id || id, title: data.title, status: data.status, level: data.level || "", labels: Array.isArray(data.labels) ? data.labels : [], actor: data.actor, claimedBy: claim?.by || null };
    });
}

// The direct children of a ticket (tickets whose parent field names it).
export function children(id) {
    return ticketDirs()
        .filter((dir) => dir !== id)
        .map((dir) => read(dir).data)
        .filter((data) => data.parent === id)
        .map((data) => ({ id: data.id, title: data.title, status: data.status }));
}

// Split a deliverable out of a compound ticket into its own child: linked with
// parent, attached to the parent's sessions, inheriting actor and level unless
// overridden. The parent becomes a coordination ticket - the workflow gate
// closes it only after every child is terminal. See doc/protocol/task.md.
export function split(id, { title, acceptance = "", actor = "", level = "" } = {}) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    const parent = read(id).data;
    if (TERMINAL.includes(parent.status)) {
        throw new Error(`ticket ${id} is terminal (${parent.status}); split an open ticket`);
    }
    const text = String(title || "").trim();
    if (!text) {
        throw new Error('ticket split needs the child title: hos ticket split <id> "<deliverable>"');
    }
    const child = create({
        title: text,
        report: `Deliverable of ${id}: ${text}`,
        acceptance,
        actor: actor || parent.actor || "",
        level: level || parent.level || ""
    });
    link(child.id, { parent: id });
    for (const sessionId of attachedTo(id)) {
        attachSession(sessionId, { ticket: child.id, reason: "subtask" });
    }
    journey(id, { actor: "alpha", kind: "split", summary: `split out ${child.id}: ${text}`, ref: child.id });
    return {
        id: child.id,
        parent: id,
        next: `hos workflow plan ${child.id} --execute <lenses> --verify <lenses>; the parent closes only after every child is terminal`
    };
}

// Open tickets whose journey has been silent for longer than
// budget.staleMinutes (default 45): the ledger's view of "work is happening
// somewhere I cannot see". Surfaced by hos status and workflow lint --open.
export function staleOpen(minutes = settings().budget?.staleMinutes ?? 45) {
    if (!(minutes >= 0)) {
        return [];
    }
    const cutoff = Date.now() - minutes * 60000;
    return list()
        .filter((t) => !TERMINAL.includes(t.status))
        .map((t) => ({ id: t.id, status: t.status, lastEvent: show(t.id).journey.at(-1)?.ts || null }))
        .filter((t) => t.lastEvent && new Date(t.lastEvent).getTime() < cutoff);
}

// Open tickets that lexically match free text, strongest first - the dedupe
// primitive behind `hos ticket find` and the `similar` list in `workflow start`,
// so a request lands on the ticket that already owns it. See persona/inter.md.
export function find(text, { limit = 5 } = {}) {
    const words = new Set(tokenize(text));
    return list()
        .filter((t) => !TERMINAL.includes(t.status))
        .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            score: tokenize(t.title).reduce((s, w) => s + (words.has(w) ? 1 : 0), 0)
        }))
        .filter((t) => t.score > 0)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, limit);
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
        JSON.stringify({ ts: nowIso(), actor, cmd, exit, durationMs, out: outFile, session: activeSession() || "" }) + "\n"
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

// The plan's verification actor, used to chain the verify ritual in move().
// Read leniently: a missing or unparsable plan yields "".
function planVerifier(id) {
    const file = join(dirOf(id), "plan.json");
    if (!existsSync(file)) {
        return "";
    }
    try {
        const verification = JSON.parse(readFileSync(file, "utf8"))?.lifecycle?.verification;
        return typeof verification === "string" ? verification : "";
    } catch {
        return "";
    }
}

const ACCEPTANCE_PLACEHOLDER = "_(define before marking fixed)_";

// No m flag: a per-line $ would stop the lazy capture at the section's first
// line and hide every criterion after it.
function acceptanceSection(body) {
    return /(?:^|\n)## Acceptance[ \t]*\n([\s\S]*?)(?=\n## |$)/.exec(body)?.[1]?.trim() || "";
}

// Move a ticket to a new canonical status (see task.md) and log it. Claiming a
// change exists (fixed, or verified directly) requires defined acceptance and a
// sufficient autonomy grant - recording reality (blocked, reported, reproduced)
// never needs permission.
export function move(id, status, note = "") {
    if (!STATUSES.includes(status)) {
        throw new Error(`unknown status: ${status || "(none)"} (one of: ${STATUSES.join(", ")})`);
    }
    const { data, body } = read(id);
    if (["fixed", "verified"].includes(status)) {
        const acceptance = acceptanceSection(body);
        if (!acceptance || acceptance === ACCEPTANCE_PLACEHOLDER) {
            throw new Error(`ticket ${id} has no acceptance defined; fill the ## Acceptance section in its ticket.md (or create with --acceptance) before marking ${status}`);
        }
        const level = autonomyGate(data.level || "medium");
        if (!level.ok) {
            throw new Error(`${level.required} work exceeds the granted autonomy (${level.granted}); escalate through Inter (hos autonomy set ${level.required} on the user's approval) or narrow the scope`);
        }
    }
    data.status = status;
    // Leaving blocked clears a park: the user's decision has been taken.
    if (status !== "blocked" && Array.isArray(data.labels)) {
        data.labels = data.labels.filter((l) => l !== "parked");
    }
    data.updated = today();
    writeFileSync(join(dirOf(id), "ticket.md"), fm.serialize(data, body));
    journey(id, { actor: "alpha", kind: "status", summary: `-> ${status}${note ? `: ${note}` : ""}`, ref: status });
    rebuildIndex();
    // Chain the protocol: each move names the step task.md expects next, so an
    // agent advances without re-reading the doc.
    const verifier = planVerifier(id) || "<verifier>";
    const next = status === "fixed"
        ? `Verify in a fresh context: hos session open "Verify ${id}", then hos compose ${verifier} --ticket ${id} (or dispatch a sub-agent: hos dispatch ${id} --lenses ${verifier}), then hos ticket verify ${id} --result pass|fail --by ${verifier}`
        : status === "verified"
            ? `Dispatch the retrospective (hos retro ${id} --outcome <taxonomy>); Inter renders hos report when the session settles`
            : "";
    return next ? { id, status, next } : { id, status };
}

// Set the change level a ticket genuinely requires (low|medium|high). Alpha sets
// it at planning; rev verifies the declared level matches the diff. See the
// change-levels & autonomy section of doc/protocol/task.md.
export function setLevel(id, level) {
    const { data, body } = read(id);
    data.level = normalizeLevel(level);
    data.updated = today();
    writeFileSync(join(dirOf(id), "ticket.md"), fm.serialize(data, body));
    journey(id, { actor: "alpha", kind: "level", summary: `level -> ${data.level}` });
    rebuildIndex();
    return { id, level: data.level };
}

// Journey kinds that count as observed effort, alongside captured runs. HOS cannot
// see tokens, so the honest signal is the recorded actions on the ticket.
const WORK_KINDS = ["status", "verify", "note", "handoff", "level"];

function readBudget(id) {
    const path = join(dirOf(id), "budget.json");
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

// Record Alpha's effort estimate for a ticket (planning). Stored beside the
// ticket, not in frontmatter, because the estimate is a small structured object.
export function setBudget(id, { estimate, unit = "steps" } = {}) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    const n = Number(estimate);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error("budget needs --estimate <positive number>");
    }
    writeFileSync(join(dirOf(id), "budget.json"), JSON.stringify({ estimate: n, unit, setBy: "alpha", at: nowIso() }, null, 2) + "\n");
    journey(id, { actor: "alpha", kind: "budget", summary: `estimate ${n} ${unit}` });
    return { id, estimate: n, unit };
}

// Compare observed effort (captured runs plus work events) against the estimate.
// `over` is the park trigger: observed has reached overrunFactor x estimate.
export function budgetStatus(id) {
    const budget = readBudget(id);
    const runCount = runs(id).length;
    const events = show(id).journey.filter((e) => WORK_KINDS.includes(e.kind)).length;
    const observed = runCount + events;
    const factor = settings().budget?.overrunFactor ?? 1.6;
    const estimate = budget?.estimate || 0;
    const ratio = estimate > 0 ? Number((observed / estimate).toFixed(2)) : 0;
    return { id, estimate, unit: budget?.unit || "steps", observed, runs: runCount, events, overrunFactor: factor, ratio, over: estimate > 0 && ratio >= factor };
}

// Park a ticket for a user decision (budget overrun, or a too-large/unclear task).
// It becomes a blocked ticket carrying the `parked` label; Inter surfaces it and
// drives the decision. See doc/protocol/task.md and persona/inter.md.
export function park(id, { note = "", by = "alpha" } = {}) {
    const { data, body } = read(id);
    data.status = "blocked";
    data.labels = addUnique(Array.isArray(data.labels) ? data.labels : [], "parked");
    data.updated = today();
    writeFileSync(join(dirOf(id), "ticket.md"), fm.serialize(data, body));
    journey(id, { actor: by, kind: "park", summary: note || "parked for a user decision", ref: "parked" });
    rebuildIndex();
    return { id, status: "blocked", parked: true, note };
}

// Record a verification attempt as a structured event so metrics need not parse
// free text. The event carries the session it ran in (explicit --session wins
// over the active one), so the workflow gate can prove the verification did not
// reuse a work session. See doc/protocol/testing.md.
export function verify(id, { result = "pass", note = "", by = "tester", step = "", evidence = "", session = "" } = {}) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    if (!["pass", "fail"].includes(result)) {
        throw new Error("verify result must be pass or fail");
    }
    const inSession = session || activeSession() || "";
    const details = [
        note,
        step ? `step=${step}` : "",
        evidence ? `evidence=${evidence}` : ""
    ].filter(Boolean).join("; ");
    journey(id, { actor: by, kind: "verify", summary: `${result}${details ? `: ${details}` : ""}`, ref: result, step, evidence, session: inSession });
    const next = result === "pass"
        ? `hos ticket move ${id} verified`
        : "Follow the plan's onFail: return to the execution step, fix, and re-verify.";
    return { ok: true, id, result, session: inSession, next };
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

// Rename a ticket's title; the id and directory stay stable. The common case is
// replacing a verbatim user-language intake title with the harness-language one
// (doc/protocol/language.md).
export function retitle(id, title) {
    if (!existsSync(dirOf(id))) {
        throw new Error(`no such ticket: ${id}`);
    }
    const text = String(title || "").trim();
    if (!text) {
        throw new Error("ticket title needs the new title text");
    }
    const { data, body } = read(id);
    const previous = data.title;
    data.title = text;
    data.updated = today();
    writeFileSync(join(dirOf(id), "ticket.md"), fm.serialize(data, body));
    journey(id, { actor: "inter", kind: "retitle", summary: `${previous} -> ${text}` });
    rebuildIndex();
    return { id, title: text, previous };
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
        .map((t) => `| ${t.id} | ${t.title} | ${t.status} | ${t.level || "-"} | \`${t.actor || "-"}\` | ${t.claimedBy ? `\`${t.claimedBy}\`` : "-"} |`);
    const out = [
        "# Ticket Ledger", "",
        "The in-repo tracker. Generated by `hos ticket index` -- do not edit by",
        "hand. See `.hos/doc/protocol/task.md`.", "",
        "| ID | Title | Status | Level | Actor | Claim |", "| -- | ----- | ------ | ----- | ----- | ----- |",
        ...(rows.length ? rows : ["| - | _none yet_ | - | - | - | - |"]), ""
    ].join("\n");
    writeFileAtomic(TICKETS_INDEX, out);
    return TICKETS_INDEX;
}
