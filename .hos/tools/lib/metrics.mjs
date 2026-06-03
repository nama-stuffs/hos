// Diagnostic delivery metrics computed from the ticket journey. They describe HOW
// a ticket went - the shape of delivery - and are reporting signals only. They are
// never an eligibility gate: harness-quality proof is the benchmark (bench.md).
// Everything here is derived from structured journey events, not free text.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TICKETS_DIR } from "./paths.mjs";
import { show } from "./ledger.mjs";
import { gather } from "./session.mjs";

const STAGE_ORDER = { reported: 0, reproduced: 1, fixed: 2, verified: 3 };

function evidenceCount(id) {
    const dir = join(TICKETS_DIR, id, "evidence");
    return existsSync(dir) ? readdirSync(dir).length : 0;
}

function retroOutcomes(events) {
    const outcomes = events
        .filter((e) => e.kind === "retro")
        .flatMap((e) => String(e.summary).split(":")[0].split(",").map((s) => s.trim()).filter(Boolean));
    return [...new Set(outcomes)];
}

// Per-ticket delivery metrics from the structured journey.
export function ticketMetrics(id) {
    const { data, journey } = show(id);

    // Reopens: a status move whose target stage is below the highest stage so far.
    let peak = -1;
    let reopens = 0;
    let blocked = 0;
    for (const event of journey) {
        if (event.kind !== "status") {
            continue;
        }
        if (event.ref === "blocked") {
            blocked++;
            continue;
        }
        const stage = STAGE_ORDER[event.ref];
        if (stage === undefined) {
            continue;
        }
        if (stage < peak) {
            reopens++;
        }
        peak = Math.max(peak, stage);
    }

    const verify = journey.filter((e) => e.kind === "verify");
    const id2 = data.id || id;

    return {
        id: id2,
        status: data.status,
        events: journey.length,
        statusTransitions: journey.filter((e) => e.kind === "status").length,
        reopens,
        blockedEpisodes: blocked,
        claims: journey.filter((e) => e.kind === "claim").length,
        verifyPass: verify.filter((e) => e.ref === "pass").length,
        verifyFail: verify.filter((e) => e.ref === "fail").length,
        evidenceFiles: evidenceCount(id2),
        retrospective: journey.some((e) => e.kind === "retro"),
        retroOutcomes: retroOutcomes(journey)
    };
}

// Session-level aggregate over the tickets one request produced.
export function sessionMetrics(sessionId) {
    const session = gather(sessionId);
    const tickets = session.tickets.map((t) => ticketMetrics(t.ticket));
    const sum = (key) => tickets.reduce((n, t) => n + (t[key] || 0), 0);

    return {
        session: session.id,
        request: session.request,
        tickets: tickets.length,
        verifiedTickets: tickets.filter((t) => t.status === "verified").length,
        retrospectives: tickets.filter((t) => t.retrospective).length,
        retroOutcomes: [...new Set(tickets.flatMap((t) => t.retroOutcomes))],
        totalReopens: sum("reopens"),
        totalBlocked: sum("blockedEpisodes"),
        totalEvidence: sum("evidenceFiles"),
        verifyPass: sum("verifyPass"),
        verifyFail: sum("verifyFail"),
        perTicket: tickets
    };
}
