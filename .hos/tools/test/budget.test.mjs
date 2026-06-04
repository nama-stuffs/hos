// Soft budget + park: Alpha estimates effort; when observed effort crosses the
// overrun factor the ticket parks (blocked + parked label) for a user decision.
// See doc/protocol/task.md and persona/inter.md.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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

// hos run streams command output, not JSON; call it without parsing.
function raw(dir, args) {
    return execFileSync(process.execPath, [tool(dir), ...args], { cwd: dir, encoding: "utf8" });
}

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Budget Test"]);
    return dir;
}

test("observed effort crossing the overrun factor flags over", () => {
    const dir = project("budget-over");
    try {
        const id = run(dir, ["ticket", "create", "Sizeable"]).id;
        run(dir, ["ticket", "budget", id, "--estimate", "2"]);
        assert.equal(run(dir, ["ticket", "budget", id]).over, false, "fresh ticket is under budget");

        raw(dir, ["run", id, "--", "echo", "a"]);
        raw(dir, ["run", id, "--", "echo", "b"]);
        run(dir, ["ticket", "log", id, "--kind", "note", "--summary", "progress"]);
        run(dir, ["ticket", "log", id, "--kind", "note", "--summary", "more"]);

        const status = run(dir, ["ticket", "budget", id]);
        assert.equal(status.estimate, 2);
        assert.ok(status.observed >= 4, `observed counts runs + work events (got ${status.observed})`);
        assert.equal(status.over, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("park blocks the ticket with a parked label; leaving blocked clears it", () => {
    const dir = project("budget-park");
    try {
        const id = run(dir, ["ticket", "create", "Too big"]).id;
        const parked = run(dir, ["ticket", "park", id, "--note", "needs a decision"]);
        assert.equal(parked.status, "blocked");

        const after = run(dir, ["ticket", "show", id]);
        assert.equal(after.data.status, "blocked");
        assert.ok(after.data.labels.includes("parked"));
        assert.equal(run(dir, ["status"]).parked, 1);

        run(dir, ["ticket", "move", id, "reproduced"]);
        const moved = run(dir, ["ticket", "show", id]);
        assert.ok(!moved.data.labels.includes("parked"), "leaving blocked clears the park");
        assert.equal(run(dir, ["status"]).parked, 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("budget needs a positive estimate", () => {
    const dir = project("budget-bad");
    try {
        const id = run(dir, ["ticket", "create", "Thing"]).id;
        let failed = false;
        try {
            execFileSync(process.execPath, [tool(dir), "ticket", "budget", id, "--estimate", "0"], { cwd: dir, encoding: "utf8" });
        } catch {
            failed = true;
        }
        assert.equal(failed, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
