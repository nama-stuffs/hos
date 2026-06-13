// The inbox: an async message bus between the foreground Inter and the background
// Alpha (and any worker). One JSON file per message under .hos/msg/inbox/; reading
// a message auto-archives it to .hos/msg/archive/. The whole .hos/msg/ tree is
// gitignored runtime state. See doc/protocol/parallel.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOS_DIR } from "./paths.mjs";
import { nowIso, writeFileAtomic } from "./util.mjs";

const MSG_DIR = join(HOS_DIR, "msg");
const INBOX = join(MSG_DIR, "inbox");
const ARCHIVE = join(MSG_DIR, "archive");

function ensure() {
    mkdirSync(INBOX, { recursive: true });
    mkdirSync(ARCHIVE, { recursive: true });
}

// Append a message for a recipient (default: alpha, the background conductor).
export function send({ text, to = "alpha", by = "inter" } = {}) {
    if (!text) {
        throw new Error("msg send needs text");
    }
    ensure();
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    // Atomic, so a concurrent reader never parses a half-written message.
    writeFileAtomic(join(INBOX, `${id}.json`), JSON.stringify({ id, to, by, text, at: nowIso() }, null, 2) + "\n");
    return { ok: true, id, to };
}

function inboxMessages(to) {
    if (!existsSync(INBOX)) {
        return [];
    }
    return readdirSync(INBOX)
        .filter((f) => f.endsWith(".json"))
        .flatMap((f) => {
            try {
                return [{ file: f, ...JSON.parse(readFileSync(join(INBOX, f), "utf8")) }];
            } catch (err) {
                // Listed, then claimed and deleted by a racing drain before our
                // read: the message belongs to that drainer, not to us.
                if (err.code === "ENOENT") {
                    return [];
                }
                throw err;
            }
        })
        .filter((m) => !to || m.to === to)
        .sort((a, b) => a.id.localeCompare(b.id));
}

// Pending messages for a recipient, without archiving (a peek).
export function list(to = null) {
    return inboxMessages(to).map(({ file, ...m }) => m);
}

// Count pending messages - the wait loop reads this as part of its signature.
export function pending(to = null) {
    return inboxMessages(to).length;
}

// Return pending messages and auto-archive them, so each message is delivered
// once. The delivery claim is an exclusive create (wx) of the archive copy -
// NOT a rename: Windows renames act on the file object, so two racing renames
// of one source can both report success (the loser self-renames the already
// moved file). wx is the one primitive that picks exactly one winner
// everywhere; the inbox original is then deleted by whoever gets there.
export function drain(to = null) {
    ensure();
    const delivered = [];
    for (const m of inboxMessages(to)) {
        const { file, ...message } = m;
        try {
            writeFileSync(join(ARCHIVE, file), JSON.stringify(message, null, 2) + "\n", { flag: "wx" });
            delivered.push(message);
        } catch (err) {
            if (err.code !== "EEXIST") {
                throw err;
            }
        }
        rmSync(join(INBOX, file), { force: true });
    }
    return delivered;
}
