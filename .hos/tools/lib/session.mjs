// Sessions group everything that flowed from one user request: the tickets it
// spawned (including friction, sub-tickets, retrospectives, bug-fixes) so Inter
// can produce one structured report. The session log is a small ndjson index;
// the heavy detail lives in each ticket's journey. See doc/protocol/report.md.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_LOG, TICKETS_DIR } from "./paths.mjs";
import { nowIso, slugify } from "./util.mjs";

function readLog() {
    return existsSync(SESSIONS_LOG)
        ? readFileSync(SESSIONS_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
        : [];
}

// Open a session for a user request. Returns its id. Everything Inter and Alpha
// do for this request references it, so the report can gather them later. Ids are
// unique: a same-day request with the same slug gets a numeric suffix, so two
// sessions never share one id (mirrors ticket id allocation).
export function open(request) {
    const base = `S-${new Date().toISOString().slice(0, 10)}-${slugify(request).slice(0, 24).replace(/-+$/, "") || "session"}`;
    const taken = new Set(readLog().filter((e) => e.event === "open").map((e) => e.id));
    let id = base;
    for (let n = 2; taken.has(id); n++) {
        id = `${base}-${n}`;
    }
    appendFileSync(SESSIONS_LOG, JSON.stringify({ ts: nowIso(), id, event: "open", request }) + "\n");
    return id;
}

// Attach a ticket (and why it exists) to the active session.
export function attach(sessionId, { ticket, reason = "task" }) {
    if (!sessionId) {
        throw new Error("session attach needs a session id");
    }
    if (!ticket) {
        throw new Error("session attach needs a ticket id");
    }
    if (!readLog().some((e) => e.event === "open" && e.id === sessionId)) {
        throw new Error(`no such session: ${sessionId}`);
    }
    if (!existsSync(join(TICKETS_DIR, ticket, "ticket.md"))) {
        throw new Error(`no such ticket: ${ticket}`);
    }
    appendFileSync(SESSIONS_LOG, JSON.stringify({ ts: nowIso(), id: sessionId, event: "attach", ticket, reason }) + "\n");
}

export function close(sessionId, summary = "") {
    if (!readLog().some((e) => e.event === "open" && e.id === sessionId)) {
        throw new Error(`no such session: ${sessionId}`);
    }
    appendFileSync(SESSIONS_LOG, JSON.stringify({ ts: nowIso(), id: sessionId, event: "close", summary }) + "\n");
}

// Reconstruct a session: its request, summary, and the tickets it spawned with
// the reason each one exists (task / friction / subtask / retrospective / bugfix).
export function gather(sessionId) {
    const events = readLog().filter((e) => e.id === sessionId);
    if (!events.length) {
        throw new Error(`no such session: ${sessionId}`);
    }

    const open = events.find((e) => e.event === "open");
    const closed = events.find((e) => e.event === "close");
    const tickets = events.filter((e) => e.event === "attach").map((e) => ({ ticket: e.ticket, reason: e.reason }));

    return {
        id: sessionId,
        request: open?.request || "",
        summary: closed?.summary || "",
        tickets,
        openedAt: open?.ts,
        closedAt: closed?.ts
    };
}

export function list() {
    return readLog().filter((e) => e.event === "open").map((e) => ({ id: e.id, request: e.request, openedAt: e.ts }));
}

// The id of the most recently opened session (what "the report" defaults to).
export function latest() {
    return list().at(-1)?.id || null;
}

// The default report target: the most recently opened session that gathered
// tickets. A bare utility session - a verification context, an experiment -
// never owns the report. Falls back to the newest session of all.
export function latestAttached() {
    const events = readLog();
    const attached = new Set(events.filter((e) => e.event === "attach").map((e) => e.id));
    const opens = events.filter((e) => e.event === "open").map((e) => e.id);
    return [...opens].reverse().find((id) => attached.has(id)) || opens.at(-1) || null;
}

// The most recently opened session that is still open - the acting context that
// `hos run` and `hos ticket verify` stamp on their records. Null when every
// session is closed. With several sessions open in parallel, pass the session
// explicitly (`hos ticket verify --session <id>`) instead of relying on this.
export function active() {
    const events = readLog();
    const closed = new Set(events.filter((e) => e.event === "close").map((e) => e.id));
    return events.filter((e) => e.event === "open" && !closed.has(e.id)).at(-1)?.id || null;
}
