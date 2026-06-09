// Ticket claim: the per-ticket mutex that makes parallel dispatch safe. The
// headline test launches real concurrent processes against one ticket and proves
// exactly one wins. See doc/protocol/parallel.md.

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

// Claim exits non-zero on a lost race; capture stdout either way.
function runAllowFail(dir, args) {
    try {
        return JSON.parse(execFileSync(process.execPath, [tool(dir), ...args], { cwd: dir, encoding: "utf8" }));
    } catch (error) {
        return JSON.parse(error.stdout || "{}");
    }
}

async function claimAsync(dir, id, by) {
    try {
        const { stdout } = await pexec(process.execPath, [tool(dir), "ticket", "claim", id, "--by", by], { cwd: dir });
        return JSON.parse(stdout);
    } catch (error) {
        return JSON.parse(error.stdout || "{}");
    }
}

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Claim Test"]);
    return dir;
}

test("a ticket can be claimed once; a second claim loses and names the holder", () => {
    const dir = project("claim-once");
    try {
        const id = run(dir, ["ticket", "create", "Solo"]).id;
        assert.equal(run(dir, ["ticket", "claim", id, "--by", "agent-1"]).ok, true);

        const second = runAllowFail(dir, ["ticket", "claim", id, "--by", "agent-2"]);
        assert.equal(second.ok, false);
        assert.equal(second.claimedBy, "agent-1");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("claimable excludes claimed tickets; release returns them to the pool", () => {
    const dir = project("claim-pool");
    try {
        const id = run(dir, ["ticket", "create", "Poolable"]).id;
        let claimable = run(dir, ["ticket", "list", "--claimable"]).map((t) => t.id);
        assert.ok(claimable.includes(id));

        run(dir, ["ticket", "claim", id, "--by", "agent-1"]);
        claimable = run(dir, ["ticket", "list", "--claimable"]).map((t) => t.id);
        assert.ok(!claimable.includes(id));

        run(dir, ["ticket", "release", id]);
        claimable = run(dir, ["ticket", "list", "--claimable"]).map((t) => t.id);
        assert.ok(claimable.includes(id));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("claimable excludes a ticket blocked by an open dependency", () => {
    const dir = project("claim-blocked");
    try {
        const blocker = run(dir, ["ticket", "create", "Blocker"]).id;
        const blocked = run(dir, ["ticket", "create", "Blocked"]).id;
        run(dir, ["ticket", "link", blocked, "--blocked-by", blocker]);

        let claimable = run(dir, ["ticket", "list", "--claimable"]).map((t) => t.id);
        assert.ok(claimable.includes(blocker), "blocker is claimable");
        assert.ok(!claimable.includes(blocked), "blocked ticket is not claimable while the blocker is open");

        run(dir, ["ticket", "move", blocker, "superseded"]);
        claimable = run(dir, ["ticket", "list", "--claimable"]).map((t) => t.id);
        assert.ok(claimable.includes(blocked), "blocked ticket frees up once the blocker is terminal");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("concurrent claims on one ticket yield exactly one winner", async () => {
    const dir = project("claim-race");
    try {
        const id = run(dir, ["ticket", "create", "Contended"]).id;
        const results = await Promise.all(
            Array.from({ length: 8 }, (_, i) => claimAsync(dir, id, `agent-${i}`))
        );
        assert.equal(results.filter((r) => r.ok === true).length, 1, "exactly one process wins the claim");
        assert.equal(results.filter((r) => r.ok !== true).length, 7, "every other process loses the race");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
