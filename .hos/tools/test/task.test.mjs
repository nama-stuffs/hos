// Task playbooks: keyword-activated, reusable procedures. A request is matched
// against playbook triggers; the strongest playbook wins, ties leave the choice
// to the agent. See AGENTS.md and .hos/task/.

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

// show prints the playbook body (markdown), not JSON.
function raw(dir, args) {
    return execFileSync(process.execPath, [tool(dir), ...args], { cwd: dir, encoding: "utf8" });
}

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Task Test"]);
    return dir;
}

test("list reports the shipped playbooks", () => {
    const dir = project("task-list");
    try {
        const names = run(dir, ["task", "list"]).map((t) => t.name).sort();
        assert.deepEqual(names, ["audit", "code-optimization", "self-optimization"]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("match routes a request to the strongest playbook", () => {
    const dir = project("task-match");
    try {
        assert.equal(run(dir, ["task", "match", "optimize the harness"])[0].name, "self-optimization");
        assert.equal(run(dir, ["task", "match", "simplify this function"])[0].name, "code-optimization");
        assert.equal(run(dir, ["task", "match", "audit the files"])[0].name, "audit");
        assert.deepEqual(run(dir, ["task", "match", "deploy to production"]), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("show prints a playbook body", () => {
    const dir = project("task-show");
    try {
        assert.match(raw(dir, ["task", "show", "audit"]), /hos audit check/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
