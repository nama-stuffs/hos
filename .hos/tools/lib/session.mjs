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
// do for this request references it, so the report can gather them later.
export function open(request) {
    const id = `S-${new Date().toISOString().slice(0, 10)}-${slugify(request).slice(0, 24) || "session"}`;
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
