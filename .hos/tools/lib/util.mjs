// Shared tiny helpers used across tools. Kept in one place so slugify/today
// are not duplicated (the code audit flags repeated helpers).

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR } from "./paths.mjs";

export const today = () => new Date().toISOString().slice(0, 10);

export const nowIso = () => new Date().toISOString();

export const slugify = (text) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

// Words too common to be useful retrieval keys. Shared by memory recall and task
// matching so both tokenize text the same way.
const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is",
    "are", "be", "use", "using", "should", "must", "always", "never", "when"
]);

// Lowercase word tokens, dropping stopwords and 1-2 char noise, de-duplicated.
export function tokenize(text) {
    return [...new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOPWORDS.has(w)))];
}

// Emit and store paths with forward slashes regardless of OS. A version snapshot
// taken on Windows must match the same files computed on Linux CI, and committed
// artifacts should not carry backslashes.
export const toPosix = (p) => String(p).replaceAll("\\", "/");

// Blocking sleep without a dependency or an event loop turn: Atomics.wait on a
// throwaway buffer. Used by the lock spin and atomic-write retries; CLI
// invocations are single-purpose processes, so blocking is the point.
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));
export function sleepSync(ms) {
    Atomics.wait(SLEEP_BUFFER, 0, 0, ms);
}

// A cross-process mutex from the one primitive every filesystem makes atomic:
// mkdir. Any number of agents may hold CLI processes concurrently; whoever
// creates .hos/.cache/locks/<name>.lock owns the critical section. A holder
// that crashed is evicted after staleMs (HOS critical sections are
// milliseconds, so a stale lock is always a corpse, not a worker).
export function withLock(name, fn, { timeoutMs = 5000, staleMs = 10000 } = {}) {
    const locksDir = join(CACHE_DIR, "locks");
    mkdirSync(locksDir, { recursive: true });
    const lock = join(locksDir, `${name}.lock`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            mkdirSync(lock);
            break;
        } catch (err) {
            if (err.code !== "EEXIST") {
                throw err;
            }
            try {
                if (Date.now() - statSync(lock).mtimeMs > staleMs) {
                    rmSync(lock, { recursive: true, force: true });
                    continue;
                }
            } catch {
                continue; // the holder released between our mkdir and stat
            }
            if (Date.now() > deadline) {
                throw new Error(`lock busy: ${name} (held longer than ${timeoutMs}ms; a crashed holder clears after ${staleMs}ms)`);
            }
            sleepSync(15);
        }
    }
    try {
        return fn();
    } finally {
        rmSync(lock, { recursive: true, force: true });
    }
}

// Write via a unique temp file then rename, so a generated file (the derived
// index.md files) is never observed half-written when agents run in parallel.
// On POSIX the rename is atomic; on Windows a concurrent reader can hold the
// target and fail the rename, so retry briefly, and only then fall back to a
// direct write of the same small derived content.
export function writeFileAtomic(file, data) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, data);
    for (let attempt = 0; ; attempt++) {
        try {
            renameSync(tmp, file);
            return;
        } catch {
            if (attempt >= 4) {
                try {
                    writeFileSync(file, data);
                } finally {
                    rmSync(tmp, { force: true });
                }
                return;
            }
            sleepSync(10 + attempt * 20);
        }
    }
}

// Content fingerprint for the audit ledger: a file is "drifted" when its current
// content hash no longer matches the recorded one. See lib/audit.mjs.
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Match a forward-slash path against a glob. `**/` matches zero or more leading
// directories, `**` any run (including slashes), `*` a run within one segment,
// `?` a single non-slash char. Dependency-free; used by audit scope rules.
export function globMatch(path, pattern) {
    const DSTAR_SLASH = "\u0000";
    const DSTAR = "\u0001";
    const rx = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, DSTAR_SLASH)
        .replace(/\*\*/g, DSTAR)
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replaceAll(DSTAR_SLASH, "(?:.*/)?")
        .replaceAll(DSTAR, ".*");
    return new RegExp(`^${rx}$`).test(path);
}
