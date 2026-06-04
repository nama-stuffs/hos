// Autonomy gate + change level: a ticket declares the level it genuinely
// requires, and the gate decides what proceeds without a fresh user grant. The
// level is never lowered to slip the gate. See doc/protocol/task.md.

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

function runAllowFail(dir, args) {
    try {
        execFileSync(process.execPath, [tool(dir), ...args], { cwd: dir, encoding: "utf8" });
        return { ok: true };
    } catch (error) {
        return { ok: false, stderr: String(error.stderr || "") };
    }
}

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Autonomy Test"]);
    return dir;
}

test("default grant is medium; high escalates while medium and low proceed", () => {
    const dir = project("autonomy-default");
    try {
        assert.equal(run(dir, ["autonomy", "show"]).granted, "medium");
        assert.equal(run(dir, ["autonomy", "gate", "high"]).escalate, true);
        assert.equal(run(dir, ["autonomy", "gate", "medium"]).ok, true);
        assert.equal(run(dir, ["autonomy", "gate", "low"]).ok, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("raising the grant to high lets high proceed without escalation", () => {
    const dir = project("autonomy-grant");
    try {
        assert.equal(run(dir, ["autonomy", "set", "high"]).granted, "high");
        const gate = run(dir, ["autonomy", "gate", "high"]);
        assert.equal(gate.ok, true);
        assert.equal(gate.escalate, false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a ticket records and updates its declared change level", () => {
    const dir = project("autonomy-level");
    try {
        const id = run(dir, ["ticket", "create", "Risky refactor", "--level", "high"]).id;
        assert.equal(run(dir, ["ticket", "list"]).find((t) => t.id === id).level, "high");
        assert.equal(run(dir, ["ticket", "level", id, "low"]).level, "low");
        assert.equal(run(dir, ["ticket", "list"]).find((t) => t.id === id).level, "low");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("an unknown level is rejected at the ticket and at the gate", () => {
    const dir = project("autonomy-bad-level");
    try {
        const id = run(dir, ["ticket", "create", "Thing"]).id;
        assert.equal(runAllowFail(dir, ["ticket", "level", id, "bogus"]).ok, false);
        assert.equal(runAllowFail(dir, ["autonomy", "gate", "huge"]).ok, false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
