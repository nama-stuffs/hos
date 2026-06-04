// Tests for `hos upgrade`: framework files re-sync from a newer release while
// project-owned state is preserved. Runs the real CLI in a temp target so it
// exercises the same path resolution a real install uses.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// Run the target's own CLI. Returns parsed JSON (or raw text). On a non-zero exit
// (the upgrade error path) the printed JSON is still captured from stdout.
function run(cwd, args) {
    try {
        const out = execFileSync(process.execPath, [join(cwd, ".hos", "tools", "hos.mjs"), ...args], {
            cwd,
            encoding: "utf8"
        }).trim();
        return parse(out);
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

// A target that was installed from the current source, then aged: its recorded
// version is rolled back and one framework file is made stale, while real
// project state (a ticket, a custom policy, a spec) is added.
function staleTarget(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Upgrade Target"]);

    const settingsPath = join(dir, ".hos", "hos.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    settings.hos.version = "0.0.1";
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    writeFileSync(join(dir, ".hos", "persona", "architect.md"), "STALE FRAMEWORK CONTENT\n");

    const ticket = run(dir, ["ticket", "create", "Precious project ticket"]);
    run(dir, ["memory", "add", "Custom project policy keep me", "--trigger", "custom"]);
    run(dir, ["spec", "add", "Project Capability", "--area", "billing"]);
    return { dir, ticketId: ticket.id };
}

test("upgrade dry-run reports the stale framework file and does not write", () => {
    const { dir } = staleTarget("upg-dry");
    try {
        const plan = run(dir, ["upgrade", "--from", repoRoot]);
        assert.equal(plan.ok, true);
        assert.equal(plan.applied, false);
        assert.equal(plan.fromVersion, "0.2.0-beta");
        assert.equal(plan.currentVersion, "0.0.1");
        assert.ok(plan.changes.update >= 1, "at least one framework file differs");
        assert.ok(plan.plan.some((p) => p.file === "persona/architect.md" && p.action === "update"));
        // Dry-run must not touch the stale file.
        assert.match(readFileSync(join(dir, ".hos", "persona", "architect.md"), "utf8"), /STALE/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("upgrade --apply restores framework files, bumps version, preserves project state", () => {
    const { dir, ticketId } = staleTarget("upg-apply");
    try {
        const applied = run(dir, ["upgrade", "--from", repoRoot, "--apply"]);
        assert.equal(applied.applied, true);

        // Framework restored from the release.
        const restored = readFileSync(join(dir, ".hos", "persona", "architect.md"), "utf8");
        assert.doesNotMatch(restored, /STALE/);
        assert.equal(restored, readFileSync(join(repoRoot, ".hos", "persona", "architect.md"), "utf8"));

        // Version bumped, project values kept.
        const settings = JSON.parse(readFileSync(join(dir, ".hos", "hos.json"), "utf8"));
        assert.equal(settings.hos.version, "0.2.0-beta");
        assert.equal(settings.project.name, "Upgrade Target");

        // Project-owned state untouched.
        assert.ok(existsSync(join(dir, ".hos", "tickets", ticketId, "ticket.md")), "ticket preserved");
        assert.ok(existsSync(join(dir, ".hos", "memory", "policy", "custom-project-policy-keep-me.md")), "policy preserved");
        assert.ok(existsSync(join(dir, ".hos", "doc", "spec", "billing", "project-capability.md")), "spec preserved");
        assert.ok(existsSync(join(dir, ".hos", "doc", "bench", "baseline.json")), "bench baseline preserved");

        assert.equal(run(dir, ["doctor"]).ok, true, "doctor passes after upgrade");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("upgrade refuses without --from", () => {
    const { dir } = staleTarget("upg-nofrom");
    try {
        const result = run(dir, ["upgrade"]);
        assert.equal(result.ok, false);
        assert.match(result.error, /--from/);
        // The stale file is still stale: nothing was written.
        assert.match(readFileSync(join(dir, ".hos", "persona", "architect.md"), "utf8"), /STALE/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
