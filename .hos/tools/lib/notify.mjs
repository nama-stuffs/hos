// hos notify: fire a user-facing notification at a hook point (parked ticket,
// session settled, run complete). The harness core never embeds a transport: if
// `notify.command` is configured (a pre-set sender the user wired once), it is run
// with the event in the environment; otherwise the notification is recorded to a
// sink under the gitignored .hos/msg/ tree, so it is seen on the next status/ping.
// Channel-agnostic and frictionless once configured. See doc/protocol/parallel.md.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { HOS_DIR } from "./paths.mjs";
import { settings } from "./config.mjs";
import { nowIso } from "./util.mjs";

const SINK = join(HOS_DIR, "msg", "notifications.ndjson");

export function notify({ event = "note", message = "", ticket = "" } = {}) {
    const command = settings().notify?.command || "";
    if (command) {
        const proc = spawnSync(command, {
            shell: true,
            encoding: "utf8",
            env: { ...process.env, HOS_NOTIFY_EVENT: event, HOS_NOTIFY_MESSAGE: message, HOS_NOTIFY_TICKET: ticket }
        });
        return { ok: (proc.status ?? 1) === 0, channel: "command", event, exit: proc.status ?? 0 };
    }
    mkdirSync(join(HOS_DIR, "msg"), { recursive: true });
    appendFileSync(SINK, JSON.stringify({ ts: nowIso(), event, message, ticket }) + "\n");
    return { ok: true, channel: "sink", event, note: "no notify.command configured; recorded to msg/notifications.ndjson (seen on next status)" };
}
