// The background-conductor primitives: hos wait blocks until a ledger or inbox
// event (or an idle timeout), the inbox carries async messages between the
// foreground Inter and background Alpha, and notify fires or records a
// notification. See doc/protocol/parallel.md.

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pexec = promisify(execFile);

function tempDir(name) {
    const dir = join(tmpdir(), `hos-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

function tool(dir) {
    return join(dir, ".hos", "tools", "hos.mjs");
}

function run(dir, args) {
    return JSON.parse(execFileSync(process.execPath, [tool(dir), ...args], { cwd: dir, encoding: "utf8" }));
}

async function waitAsync(dir, args) {
    const { stdout } = await pexec(process.execPath, [tool(dir), "wait", ...args], { cwd: dir });
    return JSON.parse(stdout);
}

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Wait Test"]);
    return dir;
}

test("wait returns timeout when nothing happens", async () => {
    const dir = project("wait-timeout");
    try {
        const r = await waitAsync(dir, ["--timeout", "0.02"]);
        assert.equal(r.woke, "timeout");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("wait wakes on an inbox message addressed to the recipient", async () => {
    const dir = project("wait-msg");
    try {
        const waiting = waitAsync(dir, ["--timeout", "0.2", "--to", "alpha", "--poll-ms", "150"]);
        setTimeout(() => {
            try {
                execFileSync(process.execPath, [tool(dir), "msg", "send", "do the thing", "--to", "alpha"], { cwd: dir });
            } catch { /* the wait assertion is what matters */ }
        }, 400);
        assert.equal((await waiting).woke, "message");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("wait wakes on a ticket change", async () => {
    const dir = project("wait-ticket");
    try {
        const id = run(dir, ["ticket", "create", "Movable"]).id;
        const waiting = waitAsync(dir, ["--timeout", "0.2", "--poll-ms", "150"]);
        setTimeout(() => {
            try {
                execFileSync(process.execPath, [tool(dir), "ticket", "move", id, "reproduced"], { cwd: dir });
            } catch { /* the wait assertion is what matters */ }
        }, 400);
        assert.equal((await waiting).woke, "ticket");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("msg send, list, and drain round-trip and archive", () => {
    const dir = project("msg-roundtrip");
    try {
        run(dir, ["msg", "send", "first", "--to", "alpha"]);
        run(dir, ["msg", "send", "second", "--to", "alpha"]);
        assert.equal(run(dir, ["msg", "list", "--to", "alpha"]).length, 2);
        assert.equal(run(dir, ["msg", "drain", "--to", "alpha"]).length, 2);
        assert.equal(run(dir, ["msg", "list", "--to", "alpha"]).length, 0, "drained messages are archived, not re-delivered");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("notify records to the sink when no command is configured", () => {
    const dir = project("notify-sink");
    try {
        const r = run(dir, ["notify", "parked", "--message", "needs a decision"]);
        assert.equal(r.ok, true);
        assert.equal(r.channel, "sink");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
