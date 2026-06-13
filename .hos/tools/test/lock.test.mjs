// withLock is the cross-process mutex behind every multi-agent write. It must be
// bounded: a held lock - including an orphan that cannot be removed (Windows
// keeps a directory pending-delete while a handle lingers, answering mkdir with
// EEXIST yet stat/rm with EPERM) - must end in eviction or a "lock busy" throw,
// never an unbounded 100% CPU spin. Regression for a real incident where one
// `audit record` invocation burned ~21 min of CPU on a single un-removable lock.

import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

// Redirect harness state to a disposable store BEFORE importing the module, so
// CACHE_DIR (resolved at load time) points the lock directory away from the real .hos.
const store = mkdtempSync(join(tmpdir(), "hos-lock-"));
process.env.HOS_DIR = store;
const { withLock } = await import("../lib/util.mjs");

const locksDir = join(store, ".cache", "locks");
const lockPath = (name) => join(locksDir, `${name}.lock`);

function plantLock(name, ageMs) {
    mkdirSync(locksDir, { recursive: true });
    const p = lockPath(name);
    mkdirSync(p, { recursive: true });
    const t = new Date(Date.now() - ageMs);
    utimesSync(p, t, t);
    return p;
}

test("withLock evicts a stale orphan and runs the critical section", { timeout: 15000 }, () => {
    plantLock("stale", 60000); // a corpse: 60s old, well past staleMs
    let ran = false;
    const out = withLock("stale", () => { ran = true; return 42; }, { timeoutMs: 200, staleMs: 1000 });
    assert.equal(ran, true);
    assert.equal(out, 42);
});

test("withLock stays bounded when a stale lock cannot be removed", { timeout: 15000 }, () => {
    // A stale lock whose removal fails: on Windows an open handle on a child
    // keeps the directory un-removable (the exact incident shape); on POSIX the
    // remove succeeds and the lock is simply acquired. Either outcome is fine -
    // the contract is that the call COMPLETES. The old code span here forever.
    const p = plantLock("unremovable", 60000);
    const inner = join(p, "holder");
    writeFileSync(inner, "x");
    const fd = openSync(inner, "r");
    const started = Date.now();
    try {
        let threw = false;
        try {
            withLock("unremovable", () => true, { timeoutMs: 150, staleMs: 1000 });
        } catch (err) {
            threw = true;
            assert.match(String(err.message), /lock busy/);
        }
        const elapsed = Date.now() - started;
        assert.ok(elapsed < 8000, `withLock must be bounded, took ${elapsed}ms (threw=${threw})`);
    } finally {
        closeSync(fd);
        rmSync(p, { recursive: true, force: true });
    }
});
