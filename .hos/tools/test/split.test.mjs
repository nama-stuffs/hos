// Decomposition and intent gates: a compound ticket must split into children
// before it can close, a parent closes only after its children, claiming a
// change requires defined acceptance and a sufficient autonomy grant, and the
// in-flight radar (lint --open, status.stale) sees silent or compound work.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    text(dir, ["init", "--name", "Split Test"]);
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

// Pipe-separated: newlines do not survive Windows argv, so | is the portable
// multi-criteria form (renderAcceptance turns it into checkbox lines).
const COMPOUND = "pattern core works|catalog persists|book builds|studio runs";

// The full contract-v2 ritual on one ticket: compose executor, capture proof,
// fix, then verify under the planned verifier in a fresh session. A parent
// skips the proof run - its children's verified gates carry the proof.
function ritualToVerified(dir, id, { proofRun = true } = {}) {
    json(dir, ["workflow", "plan", id, "--execute", "backend", "--verify", "rev+tester"]);
    text(dir, ["compose", "backend", "--ticket", id]);
    if (proofRun) {
        text(dir, ["run", id, "--by", "backend", "--", "echo", "proof"]);
    }
    text(dir, ["ticket", "move", id, "fixed"]);
    text(dir, ["session", "open", `Verify ${id}`]);
    text(dir, ["compose", "rev+tester", "--ticket", id]);
    text(dir, ["ticket", "verify", id, "--result", "pass", "--by", "rev+tester"]);
    return runRaw(dir, ["ticket", "move", id, "verified"]);
}

test("a compound ticket cannot close as one unit, even with a perfect ritual", () => {
    const dir = project("split-compound");
    try {
        const id = json(dir, ["workflow", "start", "Port the book system", "--acceptance", COMPOUND]).ticket;

        const planned = json(dir, ["workflow", "plan", id, "--execute", "backend", "--verify", "rev+tester"]);
        assert.match(planned.hint || "", /hos ticket split/, "the plan points at the split before execution");

        const closed = ritualToVerified(dir, id);
        assert.equal(closed.status, 1);
        assert.match(closed.stderr, /acceptance criteria exceed scope.maxAcceptance/);
        assert.match(closed.stderr, /hos ticket split/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("split carves linked children and the parent closes only after them", () => {
    const dir = project("split-children");
    try {
        const started = json(dir, ["workflow", "start", "Port the book system", "--acceptance", COMPOUND, "--actor", "backend"]);
        const parent = started.ticket;

        const a = json(dir, ["ticket", "split", parent, "Pattern core", "--acceptance", "The pattern core validates and classifies."]);
        const b = json(dir, ["ticket", "split", parent, "Book builder", "--acceptance", "The book builds with generated assets."]);
        assert.match(a.next, /hos workflow plan/, "split chains to planning the child");

        const child = json(dir, ["ticket", "show", a.id]);
        assert.equal(child.data.parent, parent, "the child links its parent");
        assert.equal(child.data.actor, "backend", "the child inherits the parent's actor");

        const sessions = json(dir, ["metrics", "session", started.session]);
        assert.equal(sessions.tickets, 3, "children attach to the parent's session");

        // The parent's own ritual is complete (without a proof run of its
        // own), but a child is still open.
        const blocked = ritualToVerified(dir, parent, { proofRun: false });
        assert.equal(blocked.status, 1);
        assert.match(blocked.stderr, /a parent closes only after its children are terminal/);
        assert.doesNotMatch(blocked.stderr, /exceed scope.maxAcceptance/, "a split compound is no longer compound");

        // One child closes through the full ritual, the other is superseded.
        const childClosed = ritualToVerified(dir, a.id);
        assert.equal(childClosed.status, 0, childClosed.stderr);
        text(dir, ["ticket", "move", b.id, "superseded"]);

        // Now the parent closes - with no hos run of its own: the children's
        // verified gates carried the proof.
        const closed = runRaw(dir, ["ticket", "move", parent, "verified"]);
        assert.equal(closed.status, 0, closed.stderr);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("split refuses terminal parents and empty titles", () => {
    const dir = project("split-guards");
    try {
        const id = json(dir, ["ticket", "create", "Done work", "--acceptance", "Done."]).id;
        text(dir, ["ticket", "move", id, "superseded"]);
        const terminal = runRaw(dir, ["ticket", "split", id, "Late child"]);
        assert.equal(terminal.status, 1);
        assert.match(terminal.stderr, /is terminal/);

        const open = json(dir, ["ticket", "create", "Open work", "--acceptance", "Open."]).id;
        const untitled = runRaw(dir, ["ticket", "split", open]);
        assert.equal(untitled.status, 1);
        assert.match(untitled.stderr, /needs the child title/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("claiming a change requires defined acceptance and a sufficient grant", () => {
    const dir = project("split-intent-gates");
    try {
        const bare = json(dir, ["ticket", "create", "No acceptance yet"]).id;
        const placeholder = runRaw(dir, ["ticket", "move", bare, "fixed"]);
        assert.equal(placeholder.status, 1);
        assert.match(placeholder.stderr, /no acceptance defined/);

        const high = json(dir, ["ticket", "create", "Risky refactor", "--acceptance", "Parity holds.", "--level", "high"]).id;
        const overGrant = runRaw(dir, ["ticket", "move", high, "fixed"]);
        assert.equal(overGrant.status, 1);
        assert.match(overGrant.stderr, /exceeds the granted autonomy/);

        text(dir, ["autonomy", "set", "high"]);
        assert.equal(json(dir, ["ticket", "move", high, "fixed"]).status, "fixed");

        // Recording reality is never gated: blocked needs no acceptance.
        assert.equal(json(dir, ["ticket", "move", bare, "blocked"]).status, "blocked");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("lint --open audits in-flight work as advisory instead of skipping it", () => {
    const dir = project("split-lint-open");
    try {
        const id = json(dir, ["workflow", "start", "Unplanned work", "--acceptance", COMPOUND]).ticket;

        const open = json(dir, ["workflow", "lint", "--open"]);
        assert.equal(open.ok, true, "in-flight gaps advise, they do not fail");
        assert.ok(open.tickets.some((t) => t.id === id), "open tickets are audited, not skipped");
        assert.match(open.warnings.join("\n"), /plan\.steps must contain/, "the unplanned stub surfaces as a warning");
        assert.match(open.warnings.join("\n"), /exceed scope.maxAcceptance/, "compound scope surfaces while open");

        // Silence: with the stale window at zero, any open ticket is flagged.
        const settingsPath = join(dir, ".hos", "hos.json");
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        settings.budget = { ...settings.budget, staleMinutes: 0 };
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

        const stale = json(dir, ["workflow", "lint", "--open"]);
        assert.match(stale.warnings.join("\n"), /no recorded work/, "silent open work is flagged");
        assert.ok(json(dir, ["status"]).stale.includes(id), "status surfaces the silent ticket");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("doctor flags project-command drift and checks sync repairs it", () => {
    const dir = project("split-checks-sync");
    try {
        assert.equal(json(dir, ["status"]).stale.length, 0, "a fresh project is not stale");

        writeFileSync(join(dir, "package.json"), JSON.stringify({
            name: "host-app",
            private: true,
            scripts: { test: "echo tests", build: "echo build" }
        }, null, 2) + "\n");

        const drifted = runRaw(dir, ["doctor"]);
        assert.equal(drifted.status, 1);
        assert.match(drifted.stdout, /run hos checks sync/);

        const synced = json(dir, ["checks", "sync"]);
        assert.equal(synced.ok, true);
        assert.equal(synced.runtime.build, "npm run build");

        const healthy = runRaw(dir, ["doctor"]);
        assert.equal(healthy.status, 0, healthy.stdout);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
