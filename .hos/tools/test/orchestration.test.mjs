// Orchestration core: the two-layer ticket (terse surface vs deep command log),
// stale-claim reclaim, and the dispatch brief. See doc/protocol/parallel.md.

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
    text(dir, ["init", "--name", "Orchestration Test"]);
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
        return { status: 0, stdout: text(dir, args) };
    } catch (error) {
        return { status: error.status ?? 1, stdout: error.stdout || "" };
    }
}

test("hos run captures a command's output and exit into the deep log", () => {
    const dir = project("orch-run");
    try {
        const id = json(dir, ["ticket", "create", "Run capture"]).id;
        text(dir, ["run", id, "--by", "w", "--", "echo", "CAPTURED"]);

        const thread = json(dir, ["ticket", "thread", id]);
        assert.equal(thread.runs.length, 1);
        assert.equal(thread.runs[0].exit, 0);
        const out = readFileSync(join(dir, ".hos", "tickets", id, "log", thread.runs[0].out), "utf8");
        assert.match(out, /CAPTURED/, "full command output is in the deep log");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("hos run records a non-zero exit and still propagates it", () => {
    const dir = project("orch-run-fail");
    try {
        const id = json(dir, ["ticket", "create", "Run fail"]).id;
        const r = runRaw(dir, ["run", id, "--", "exit", "3"]);
        assert.equal(r.status, 3, "the child's exit code propagates");
        assert.equal(json(dir, ["ticket", "thread", id]).runs[0].exit, 3, "the failure is recorded");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("ticket log writes a terse surface event; runs stay in the deep log", () => {
    const dir = project("orch-log");
    try {
        const id = json(dir, ["ticket", "create", "Surface"]).id;
        text(dir, ["run", id, "--", "echo", "x"]);
        text(dir, ["ticket", "log", id, "--kind", "handoff", "--summary", "done", "--by", "w"]);

        const thread = json(dir, ["ticket", "thread", id]);
        assert.ok(thread.journey.some((e) => e.kind === "handoff"), "handoff is on the surface journey");
        assert.ok(!thread.journey.some((e) => e.kind === "run"), "runs are deep-only, keeping the surface terse");
        assert.equal(thread.runs.length, 1);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a stale claim is reclaimable; release --stale refuses a fresh claim", () => {
    const dir = project("orch-stale");
    try {
        const id = json(dir, ["ticket", "create", "Stale"]).id;
        json(dir, ["ticket", "claim", id, "--by", "w"]);

        let claimable = json(dir, ["ticket", "list", "--claimable"]).map((t) => t.id);
        assert.ok(!claimable.includes(id), "a fresh claim is held");
        assert.equal(json(dir, ["ticket", "release", id, "--stale"]).released, false, "fresh claim is not released as stale");

        const claimFile = join(dir, ".hos", "tickets", id, "claim.json");
        const claim = JSON.parse(readFileSync(claimFile, "utf8"));
        claim.at = new Date(Date.now() - 99 * 60000).toISOString();
        writeFileSync(claimFile, JSON.stringify(claim));

        claimable = json(dir, ["ticket", "list", "--claimable"]).map((t) => t.id);
        assert.ok(claimable.includes(id), "an aged claim is reclaimable");
        assert.equal(json(dir, ["ticket", "release", id, "--stale"]).released, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("dispatch emits a self-contained worker brief", () => {
    const dir = project("orch-dispatch");
    try {
        const id = json(dir, ["ticket", "create", "Brief me"]).id;
        const brief = text(dir, ["dispatch", id, "--lenses", "frontend+ux", "--by", "worker-a"]);
        assert.match(brief, /Frontend/, "composed persona is included");
        assert.match(brief, /Brief me/, "ticket surface is included");
        assert.match(brief, /Alpha plan/, "Alpha's plan is included");
        assert.match(brief, /Worker contract/, "the contract is included");
        assert.match(brief, new RegExp(`run ${id}`), "run-capture instruction names the ticket");
        assert.match(brief, /not spawn/i, "workers are told not to spawn");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
