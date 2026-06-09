// Retrospective + metrics: structured journey events (retro, verify), the
// delivery metrics derived from them, and composition of the new lenses.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function project(name) {
    const dir = join(tmpdir(), `hos-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    text(dir, ["init", "--name", "Retro Test"]);
    return dir;
}

function text(dir, args) {
    return execFileSync(process.execPath, [join(dir, ".hos", "tools", "hos.mjs"), ...args], { cwd: dir, encoding: "utf8" });
}

function json(dir, args) {
    return JSON.parse(text(dir, args));
}

function runRaw(dir, args) {
    try {
        return { status: 0, stderr: "", stdout: text(dir, args) };
    } catch (error) {
        return { status: error.status ?? 1, stderr: error.stderr || "", stdout: error.stdout || "" };
    }
}

test("metrics computes reopens, verify outcomes, and retrospective from the journey", () => {
    const dir = project("retro-metrics");
    try {
        const started = json(dir, [
            "workflow", "start", "Lifecycle",
            "--acceptance", "Lifecycle closes with proof.",
            "--actor", "backend",
            "--level", "high"
        ]);
        const id = started.ticket;
        json(dir, [
            "workflow", "plan", id,
            "--execute", "backend",
            "--verify", "rev+tester",
            "--evidence", "captured proof"
        ]);
        // reported -> reproduced -> fixed -> reproduced (a reopen) -> verified
        text(dir, ["ticket", "move", id, "reproduced"]);
        text(dir, ["ticket", "move", id, "fixed"]);
        text(dir, ["ticket", "move", id, "reproduced"]);
        text(dir, ["ticket", "verify", id, "--result", "fail"]);
        text(dir, ["run", id, "--by", "tester", "--", "echo", "proof"]);
        text(dir, ["ticket", "verify", id, "--result", "pass"]);
        text(dir, ["ticket", "move", id, "verified"]);
        text(dir, ["retro", id, "--outcome", "spec-update,bench-scenario", "--by", "optimizer+curator"]);

        const m = json(dir, ["metrics", "ticket", id]);
        assert.equal(m.status, "verified");
        assert.equal(m.statusTransitions, 4);
        assert.equal(m.reopens, 1, "one backward status move counts as a reopen");
        assert.equal(m.verifyFail, 1);
        assert.equal(m.verifyPass, 1);
        assert.equal(m.retrospective, true);
        assert.deepEqual(m.retroOutcomes.sort(), ["bench-scenario", "spec-update"]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("retro rejects an unknown outcome and requires one", () => {
    const dir = project("retro-validate");
    try {
        const id = json(dir, ["ticket", "create", "Validate"]).id;
        const bad = runRaw(dir, ["retro", id, "--outcome", "frobnicate"]);
        assert.equal(bad.status, 1);
        assert.match(bad.stderr, /unknown retro outcome/);

        const none = runRaw(dir, ["retro", id]);
        assert.equal(none.status, 1);
        assert.match(none.stderr, /needs --outcome/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("compose optimizer+curator assembles both retrospective lenses", () => {
    const dir = project("retro-compose");
    try {
        const out = text(dir, ["compose", "optimizer+curator"]);
        assert.match(out, /Optimizer/);
        assert.match(out, /Curator/);
        assert.match(out, /file-based agent harness/); // AGENTS.md is included
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("metrics session aggregates the tickets a request produced", () => {
    const dir = project("retro-session");
    try {
        const session = text(dir, ["session", "open", "Two-ticket request"]).trim();
        const a = json(dir, ["ticket", "create", "First"]).id;
        const b = json(dir, ["ticket", "create", "Second"]).id;
        text(dir, ["session", "attach", session, a, "--reason", "task"]);
        text(dir, ["session", "attach", session, b, "--reason", "subtask"]);
        text(dir, ["retro", a, "--outcome", "no-op"]);

        const m = json(dir, ["metrics", "session", session]);
        assert.equal(m.tickets, 2);
        assert.equal(m.retrospectives, 1);
        assert.ok(m.retroOutcomes.includes("no-op"));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
