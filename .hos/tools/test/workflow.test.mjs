// Workflow gate: the executable form of the Inter -> Alpha -> composed lenses ->
// separate verification -> retrospective contract.

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
    text(dir, ["init", "--name", "Workflow Test"]);
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
        return { status: 0, stdout: text(dir, args), stderr: "" };
    } catch (error) {
        return { status: error.status ?? 1, stdout: error.stdout || "", stderr: error.stderr || "" };
    }
}

test("workflow start performs Inter intake in one reconstructable step", () => {
    const dir = project("workflow-start");
    try {
        const out = json(dir, [
            "workflow", "start", "Build catalog shell",
            "--acceptance", "Catalog shell exists.",
            "--actor", "frontend+ux",
            "--level", "medium"
        ]);

        assert.match(out.session, /^S-/);
        assert.match(out.ticket, /^T-/);

        const metrics = json(dir, ["metrics", "session", out.session]);
        assert.equal(metrics.tickets, 1);
        assert.equal(metrics.perTicket[0].id, out.ticket);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("ticket move verified rejects the old bypass shape", () => {
    const dir = project("workflow-reject");
    try {
        const id = json(dir, [
            "ticket", "create", "Bypass",
            "--acceptance", "Do the thing.",
            "--actor", "backend",
            "--level", "high"
        ]).id;

        const closed = runRaw(dir, ["ticket", "move", id, "verified"]);
        assert.equal(closed.status, 1);
        assert.match(closed.stderr, /workflow gate failed/);
        assert.match(closed.stderr, /plan\.lifecycle\.verification/);
        assert.match(closed.stderr, /not attached to a valid session/);
        assert.match(closed.stderr, /verify pass/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("planned execution plus separate proof can close, then requires retrospective accounting", () => {
    const dir = project("workflow-close");
    try {
        const started = json(dir, [
            "workflow", "start", "Close with proof",
            "--acceptance", "Proof is captured.",
            "--actor", "backend",
            "--level", "high"
        ]);
        const id = started.ticket;

        json(dir, [
            "workflow", "plan", id,
            "--execute", "backend",
            "--verify", "rev+tester",
            "--evidence", "captured command proof"
        ]);
        text(dir, ["ticket", "move", id, "reproduced"]);
        text(dir, ["ticket", "move", id, "fixed"]);
        text(dir, ["run", id, "--by", "tester", "--", "echo", "proof"]);
        text(dir, ["ticket", "verify", id, "--result", "pass", "--by", "tester", "--step", "s2", "--evidence", "run log"]);
        text(dir, ["ticket", "move", id, "verified"]);

        assert.equal(json(dir, ["workflow", "lint", id, "--open"]).ok, true);

        const missingRetro = runRaw(dir, ["workflow", "lint", id]);
        assert.equal(missingRetro.status, 1);
        assert.match(missingRetro.stdout, /missing retrospective accounting/);

        text(dir, ["retro", id, "--outcome", "no-op", "--by", "optimizer+curator"]);
        assert.equal(json(dir, ["workflow", "lint", id]).ok, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("session attach validates both ends of the relation", () => {
    const dir = project("workflow-session-attach");
    try {
        const badSession = runRaw(dir, ["session", "attach", "S-missing", "T-missing", "--reason", "task"]);
        assert.equal(badSession.status, 1);
        assert.match(badSession.stderr, /no such session/);

        const session = text(dir, ["session", "open", "Attach"]).trim();
        const badTicket = runRaw(dir, ["session", "attach", session, "T-missing", "--reason", "task"]);
        assert.equal(badTicket.status, 1);
        assert.match(badTicket.stderr, /no such ticket/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
