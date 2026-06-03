// Computes harness readiness so Inter can install, adopt, or run.

import { existsSync } from "node:fs";
import { MEMORY_DIR, SPEC_DIR, TICKETS_DIR } from "./paths.mjs";
import { settings } from "./config.mjs";
import { onboarding } from "./onboard.mjs";
import { list } from "./ledger.mjs";

export function status() {
    const onboard = onboarding();
    const ready = onboard.mode === "run";
    const tickets = ready ? list() : [];

    return {
        mode: onboard.mode,
        next: onboard.reason,
        project: ready ? settings().project.name : null,
        memoryStore: existsSync(MEMORY_DIR),
        ticketsDir: existsSync(TICKETS_DIR),
        specDir: existsSync(SPEC_DIR),
        open: tickets.filter((t) => !["verified", "superseded", "duplicate"].includes(t.status)).length,
        total: tickets.length
    };
}
