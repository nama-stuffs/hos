// Install-mode coverage the drop-in smoke suite deliberately skips:
// real git repositories, and the guard that refuses init/adopt in the HOS
// source repo. Runs the real CLI in temp targets.

import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

function run(cwd, args) {
    return JSON.parse(execFileSync(process.execPath, [join(cwd, ".hos", "tools", "hos.mjs"), ...args], {
        cwd,
        encoding: "utf8"
    }).trim());
}

// Capture status + streams so the refusal path (non-zero exit) can be asserted.
function runRaw(cwd, args) {
    try {
        const stdout = execFileSync(process.execPath, [join(cwd, ".hos", "tools", "hos.mjs"), ...args], {
            cwd,
            encoding: "utf8"
        });
        return { status: 0, stdout, stderr: "" };
    } catch (error) {
        return { status: error.status ?? 1, stdout: error.stdout || "", stderr: error.stderr || "" };
    }
}

function hasGit() {
    try {
        execFileSync("git", ["--version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

test("drop-in adopts inside a real git repo and merges AGENTS.md in one step", { skip: !hasGit() ? "git not available" : false }, () => {
    const dir = tempDir("git-adopt");
    try {
        const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
        git("init", "-q");
        git("config", "user.email", "t@t.io");
        git("config", "user.name", "t");
        writeFileSync(join(dir, "README.md"), "# Acme App\n");
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "acme", scripts: { test: "node --test" } }, null, 2));
        writeFileSync(join(dir, "AGENTS.md"), "# Acme Agents\n\nHouse rule: ship small.\n");
        writeFileSync(join(dir, ".gitignore"), "dist/\nnode_modules/\n");
        git("add", "-A");
        git("commit", "-qm", "host project");

        // Drop in the harness; the host AGENTS.md must be preserved, not clobbered.
        cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });

        assert.equal(run(dir, ["status"]).mode, "adopt", "git host reports adopt");

        const adopt = run(dir, ["adopt", "--name", "Acme App", "--agents-strategy", "append"]);
        assert.equal(adopt.agents.strategy, "append", "agents merged in the same call");

        const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
        assert.match(agents, /House rule: ship small\./, "host AGENTS content preserved");
        assert.match(agents, /## HOS/, "HOS section appended");

        const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
        assert.match(ignore, /dist\//, "host ignore rules preserved");
        assert.match(ignore, /\.hos\/task\/\*/, "HOS ignore block added");

        assert.equal(run(dir, ["doctor"]).ok, true, "doctor passes in a git-backed adoption");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("init and adopt refuse in the HOS source repo, which reports source mode", () => {
    const dir = tempDir("source-guard");
    try {
        cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
        cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
        // The source repo is identified by the README's first line.
        writeFileSync(join(dir, "README.md"), "# HOS - Harness Operating System\n\nx\n");

        assert.equal(run(dir, ["status"]).mode, "source", "source repo reports source mode");

        const init = runRaw(dir, ["init", "--name", "Nope"]);
        assert.equal(init.status, 1);
        assert.match(init.stderr, /refuses to run in the HOS source repo/);

        const adopt = runRaw(dir, ["adopt", "--name", "Nope"]);
        assert.equal(adopt.status, 1);
        assert.match(adopt.stderr, /refuses to run in the HOS source repo/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
