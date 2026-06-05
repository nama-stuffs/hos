// hos wait: block until something happens on the ledger or in the inbox, then
// return. This is the cost-efficient heartbeat for a background Alpha: between
// wakes the agent does not think (it waits on this child process), so a long
// session costs only per wake, not per minute. Pure polling (no fs.watch) keeps it
// cross-platform and reliable; sub-second latency is irrelevant over hours. A
// configurable idle timeout always returns so Alpha can re-evaluate and checkpoint.
// See doc/protocol/parallel.md.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TICKETS_DIR } from "./paths.mjs";
import { settings } from "./config.mjs";
import * as msg from "./msg.mjs";

// A cheap fingerprint of "did anything change": ticket count + total journey size
// (any move, run, or log grows a journey) + pending messages for this recipient.
function signature(to) {
    let tickets = 0;
    let journeyBytes = 0;
    if (existsSync(TICKETS_DIR)) {
        for (const entry of readdirSync(TICKETS_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            tickets++;
            const journey = join(TICKETS_DIR, entry.name, "journey.ndjson");
            if (existsSync(journey)) {
                journeyBytes += statSync(journey).size;
            }
        }
    }
    return { tickets, journeyBytes, messages: msg.pending(to) };
}

const changed = (a, b) => a.tickets !== b.tickets || a.journeyBytes !== b.journeyBytes || a.messages !== b.messages;

// Resolve when the ledger or inbox changes, or when the idle timeout elapses.
export async function waitForEvent({ timeoutMinutes = null, to = null, pollMs = 800 } = {}) {
    const minutes = timeoutMinutes ?? (settings().wait?.timeoutMinutes ?? 30);
    const deadline = Date.now() + minutes * 60000;
    const start = signature(to);

    return await new Promise((resolve) => {
        let done = false;
        const finish = (result) => {
            if (done) {
                return;
            }
            done = true;
            clearInterval(poll);
            clearTimeout(timer);
            resolve(result);
        };
        const poll = setInterval(() => {
            const now = signature(to);
            if (changed(start, now)) {
                finish({ woke: now.messages > start.messages ? "message" : "ticket", to: to || "any", since: start, now });
            }
        }, Math.max(50, pollMs));
        const timer = setTimeout(() => finish({ woke: "timeout", to: to || "any", minutes }), Math.max(0, deadline - Date.now()));
    });
}
