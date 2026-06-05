// Tests for `hos upgrade`: a three-way merge re-syncs framework files from a newer
// release while preserving project-owned state AND the project's own framework
// modifications. The merge base is the pristine "synced" snapshot captured at
// install. See doc/protocol/upgrade.md.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARCHITECT = join(".hos", "persona", "architect.md");
const UI = join(".hos", "persona", "ui.md");

function tempDir(name) {
    const dir = join(tmpdir(), `hos-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

function run(cwd, args) {
    try {
        return parse(execFileSync(process.execPath, [join(cwd, ".hos", "tools", "hos.mjs"), ...args], { cwd, encoding: "utf8" }).trim());
    } catch (error) {
        return parse((error.stdout || "").trim());
    }
}

function parse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

// A target installed from the current source. init captures the pristine "synced"
// baseline (the merge base), so a fresh target has new == base everywhere.
function target(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Upgrade Target"]);
    return dir;
}

const setFile = (dir, rel, content) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
};
// Rewrite the merge base (simulating "the file as it was at the last sync").
const setBase = (dir, rel, content) => setFile(dir, join(".hos", ".baseline", "synced", rel), content);
const setVersion = (dir, v) => {
    const p = join(dir, ".hos", "hos.json");
    const s = JSON.parse(readFileSync(p, "utf8"));
    s.hos.version = v;
    writeFileSync(p, JSON.stringify(s, null, 2));
};

test("dry-run reports a plan and writes nothing", () => {
    const dir = target("upg-dry");
    try {
        rmSync(join(dir, UI), { force: true });
        const plan = run(dir, ["upgrade", "--from", repoRoot]);
        assert.equal(plan.ok, true);
        assert.equal(plan.applied, false);
        assert.equal(plan.fromVersion, "0.3.0-beta");
        assert.ok(plan.plan.some((p) => p.file === "persona/ui.md" && p.action === "add"));
        assert.equal(existsSync(join(dir, UI)), false, "dry-run wrote nothing");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a framework file the project did not modify is overwritten with the release", () => {
    const dir = target("upg-overwrite");
    try {
        // live == base, both differ from the new release -> overwrite (restore).
        setFile(dir, ARCHITECT, "OLD VERSION\n");
        setBase(dir, "persona/architect.md", "OLD VERSION\n");
        const plan = run(dir, ["upgrade", "--from", repoRoot]);
        assert.ok(plan.plan.some((p) => p.file === "persona/architect.md" && p.action === "overwrite"));
        run(dir, ["upgrade", "--from", repoRoot, "--apply"]);
        assert.doesNotMatch(readFileSync(join(dir, ARCHITECT), "utf8"), /OLD VERSION/, "restored to the release");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a framework file the project modified is kept when upstream did not change it", () => {
    const dir = target("upg-keep");
    try {
        setFile(dir, ARCHITECT, "LOCAL MOD\n"); // base stays == new (from init)
        const applied = run(dir, ["upgrade", "--from", repoRoot, "--apply"]);
        assert.ok(applied.keptLocal.includes("persona/architect.md"));
        assert.match(readFileSync(join(dir, ARCHITECT), "utf8"), /LOCAL MOD/, "local modification preserved");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a file changed both locally and upstream is a surfaced conflict, not overwritten", () => {
    const dir = target("upg-conflict");
    try {
        setVersion(dir, "0.0.1");
        setFile(dir, ARCHITECT, "LOCAL MOD\n");
        setBase(dir, "persona/architect.md", "OLD VERSION\n"); // base differs from both
        const applied = run(dir, ["upgrade", "--from", repoRoot, "--apply"]);
        assert.ok(applied.conflicts.includes("persona/architect.md"));
        assert.match(readFileSync(join(dir, ARCHITECT), "utf8"), /LOCAL MOD/, "conflict left local content in place");
        assert.equal(JSON.parse(readFileSync(join(dir, ".hos", "hos.json"), "utf8")).hos.version, "0.0.1", "version not bumped while a conflict remains");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a clean apply restores an added file, bumps version, and preserves project state", () => {
    const dir = target("upg-clean");
    try {
        setVersion(dir, "0.0.1");
        rmSync(join(dir, UI), { force: true });
        const ticket = run(dir, ["ticket", "create", "Precious project ticket"]);
        run(dir, ["memory", "add", "Custom project policy keep me", "--trigger", "custom"]);
        run(dir, ["spec", "add", "Project Capability", "--area", "billing"]);

        const applied = run(dir, ["upgrade", "--from", repoRoot, "--apply"]);
        assert.equal(applied.applied, true);
        assert.equal(applied.conflicts.length, 0);
        assert.equal(existsSync(join(dir, UI)), true, "added framework file restored");
        assert.equal(JSON.parse(readFileSync(join(dir, ".hos", "hos.json"), "utf8")).hos.version, "0.3.0-beta", "version bumped on a clean apply");
        assert.ok(existsSync(join(dir, ".hos", "tickets", ticket.id, "ticket.md")), "ticket preserved");
        assert.ok(existsSync(join(dir, ".hos", "memory", "policy", "custom-project-policy-keep-me.md")), "policy preserved");
        assert.ok(existsSync(join(dir, ".hos", "doc", "spec", "billing", "project-capability.md")), "spec preserved");
        assert.equal(run(dir, ["doctor"]).ok, true, "doctor passes after upgrade");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("--check compares to a remote version and is offline-safe", () => {
    const dir = target("upg-check");
    try {
        setVersion(dir, "0.1.0-beta");
        const remote = join(dir, "remote-meta.mjs");
        writeFileSync(remote, 'export const HOS_VERSION = "9.9.9";\n');
        const newer = run(dir, ["upgrade", "--check", "--remote", remote]);
        assert.equal(newer.reachable, true);
        assert.equal(newer.remote, "9.9.9");
        assert.equal(newer.newer, true);

        const offline = run(dir, ["upgrade", "--check", "--remote", "https://nonexistent.invalid.example/x"]);
        assert.equal(offline.reachable, false);
        assert.equal(offline.newer, false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("--restore rolls back to the pre-update snapshot", () => {
    const dir = target("upg-restore");
    try {
        setVersion(dir, "0.0.1");
        run(dir, ["upgrade", "--from", repoRoot, "--apply"]); // creates a pre-<ts> snapshot
        setFile(dir, ARCHITECT, "BROKEN AFTER UPGRADE\n");
        const restored = run(dir, ["upgrade", "--restore"]);
        assert.equal(restored.ok, true);
        assert.doesNotMatch(readFileSync(join(dir, ARCHITECT), "utf8"), /BROKEN/, "restored from the snapshot");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("upgrade refuses without --from", () => {
    const dir = target("upg-nofrom");
    try {
        const result = run(dir, ["upgrade"]);
        assert.equal(result.ok, false);
        assert.match(result.error, /--from/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
