// Content version over files that define agent behavior.
// See doc/protocol/session.md.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENTS_MD, HOS_DIR, MEMORY_DIR, REPO_ROOT } from "./paths.mjs";
import { toPosix } from "./util.mjs";

const WATCHED = [
    AGENTS_MD,
    join(HOS_DIR, "persona"),
    join(HOS_DIR, "doc", "protocol"),
    join(MEMORY_DIR, "policy")
];

// Hash a file by its normalized text so line-ending churn (CRLF on Windows, an
// editor rewrite) does not register as a behavior change. The hash answers
// "did the meaning change?", not "did the bytes change?".
function fileDigest(file) {
    return createHash("sha1").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 12);
}

function filesUnder(path, acc = []) {
    if (!existsSync(path)) {
        return acc;
    }
    if (statSync(path).isFile()) {
        acc.push(path);
        return acc;
    }
    for (const name of readdirSync(path)) {
        filesUnder(join(path, name), acc);
    }
    return acc;
}

// A stable hash of the behavior-defining files, plus the per-file digests so a
// caller can tell exactly WHICH files changed between two versions.
export function version() {
    const files = WATCHED.flatMap((p) => filesUnder(p)).sort();
    const parts = files.map((f) => ({ file: toPosix(relative(REPO_ROOT, f)), hash: fileDigest(f) }));
    const combined = createHash("sha1").update(parts.map((p) => p.file + p.hash).join("\n")).digest("hex").slice(0, 12);
    return { version: combined, files: parts.length, parts };
}

// Which behavior files differ between a previously-seen version snapshot and now.
// Pass the `parts` array from an earlier version() call.
export function changedSince(previousParts) {
    const prev = new Map((previousParts || []).map((p) => [p.file, p.hash]));
    const now = version().parts;
    return now.filter((p) => prev.get(p.file) !== p.hash).map((p) => p.file);
}
