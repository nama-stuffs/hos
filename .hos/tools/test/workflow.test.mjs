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

        const planned = json(dir, [
            "workflow", "plan", id,
            "--execute", "backend",
            "--verify", "rev+tester",
            "--evidence", "captured command proof"
        ]);
        assert.match(planned.next, /hos ticket verify/, "plan chains to the verification step");
        text(dir, ["ticket", "move", id, "reproduced"]);
        const fixed = json(dir, ["ticket", "move", id, "fixed"]);
        assert.match(fixed.next, /hos ticket verify/, "fixed chains to verification");
        text(dir, ["run", id, "--by", "tester", "--", "echo", "proof"]);
        const passed = json(dir, ["ticket", "verify", id, "--result", "pass", "--by", "tester", "--step", "s2", "--evidence", "run log"]);
        assert.match(passed.next, /move .* verified/, "a pass chains to guarded closure");
        const closed = json(dir, ["ticket", "move", id, "verified"]);
        assert.match(closed.next, /hos retro/, "verified chains to the retrospective");

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

test("workflow start --ticket attaches an existing ticket instead of duplicating", () => {
    const dir = project("workflow-attach-existing");
    try {
        const id = json(dir, ["ticket", "create", "Owned work", "--actor", "backend"]).id;
        const out = json(dir, ["workflow", "start", "More on owned work", "--ticket", id]);
        assert.equal(out.ticket, id);
        assert.equal(out.created, false);
        assert.deepEqual(out.similar, [], "the attached owner is not its own duplicate candidate");
        assert.equal(json(dir, ["ticket", "list"]).length, 1, "no duplicate ticket was created");

        const missing = runRaw(dir, ["workflow", "start", "Bad attach", "--ticket", "T-missing"]);
        assert.equal(missing.status, 1);
        assert.match(missing.stderr, /no such ticket/);

        text(dir, ["ticket", "move", id, "superseded"]);
        const terminal = runRaw(dir, ["workflow", "start", "Late work", "--ticket", id]);
        assert.equal(terminal.status, 1);
        assert.match(terminal.stderr, /is terminal/, "closed work cannot own new intake");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("ticket find and workflow start similar make dedupe mechanical", () => {
    const dir = project("workflow-dedupe-find");
    try {
        const first = json(dir, ["workflow", "start", "Fix the login button flicker", "--actor", "frontend"]);

        const found = json(dir, ["ticket", "find", "login button broken again"]);
        assert.equal(found[0]?.id, first.ticket, "the open owner ranks first");

        const second = json(dir, ["workflow", "start", "Polish login button copy"]);
        assert.ok(second.similar.some((t) => t.id === first.ticket), "similar surfaces the existing owner");

        text(dir, ["ticket", "move", first.ticket, "superseded"]);
        const after = json(dir, ["ticket", "find", "login button"]);
        assert.ok(!after.some((t) => t.id === first.ticket), "terminal tickets stop owning work");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a verify fail recorded after a pass blocks verified closure", () => {
    const dir = project("workflow-fail-after-pass");
    try {
        const id = json(dir, [
            "workflow", "start", "Regression after pass",
            "--acceptance", "Stays verified only while passing.",
            "--actor", "backend",
            "--level", "medium"
        ]).ticket;
        json(dir, ["workflow", "plan", id, "--execute", "backend", "--verify", "rev+tester"]);
        text(dir, ["run", id, "--by", "tester", "--", "echo", "proof"]);
        text(dir, ["ticket", "verify", id, "--result", "pass", "--by", "tester"]);
        text(dir, ["ticket", "verify", id, "--result", "fail", "--by", "tester"]);

        const closed = runRaw(dir, ["ticket", "move", id, "verified"]);
        assert.equal(closed.status, 1);
        assert.match(closed.stderr, /verify pass as the latest/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("executor and verifier are compared as lens sets, not strings", () => {
    const dir = project("workflow-actor-sets");
    try {
        const id = json(dir, ["ticket", "create", "Set compare", "--actor", "backend"]).id;
        const dodged = runRaw(dir, ["workflow", "plan", id, "--execute", "rev+backend", "--verify", "backend+rev"]);
        assert.equal(dodged.status, 1);
        assert.match(dodged.stderr, /different execute and verify actors/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("ticket move rejects a status outside the canonical model", () => {
    const dir = project("workflow-bad-status");
    try {
        const id = json(dir, ["ticket", "create", "Status typo"]).id;
        const moved = runRaw(dir, ["ticket", "move", id, "verifed"]);
        assert.equal(moved.status, 1);
        assert.match(moved.stderr, /unknown status/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("same-day sessions with the same slug get distinct ids", () => {
    const dir = project("workflow-session-ids");
    try {
        const first = text(dir, ["session", "open", "Fix the login button"]).trim();
        const second = text(dir, ["session", "open", "Fix the login button"]).trim();
        assert.notEqual(first, second, "a slug collision must not merge two sessions");
        assert.match(second, /-2$/);

        const truncated = text(dir, ["session", "open", "Add a discount function to the cart"]).trim();
        assert.doesNotMatch(truncated, /-$/, "the 24-char cut never leaves a dangling hyphen");
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
