// Audit ledger + gate: production files are born audited and re-audited on
// change; tests and build tooling are out of scope. See doc/protocol/audit.md.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// audit check exits non-zero on findings; capture stdout either way.
function audit(dir, args) {
    try {
        return JSON.parse(execFileSync(process.execPath, [tool(dir), "audit", ...args], { cwd: dir, encoding: "utf8" }));
    } catch (error) {
        return JSON.parse(error.stdout || "{}");
    }
}

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Audit Test"]);
    return dir;
}

function setScope(dir, include) {
    const file = join(dir, ".hos", "hos.json");
    const json = JSON.parse(readFileSync(file, "utf8"));
    json.audit = { include, exclude: [] };
    writeFileSync(file, JSON.stringify(json, null, 2));
}

function writeFile(dir, rel, content) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
}

test("empty scope is an advisory no-op", () => {
    const dir = project("audit-noop");
    try {
        const r = audit(dir, ["check"]);
        assert.equal(r.ok, true);
        assert.equal(r.scopeConfigured, false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("in-scope files start unaudited; tests stay out of scope", () => {
    const dir = project("audit-scope");
    try {
        setScope(dir, ["src/**/*.js"]);
        writeFile(dir, "src/app.js", "export const a = 1;\n");
        writeFile(dir, "src/util.js", "export const b = 2;\n");
        writeFile(dir, "src/app.test.js", "test('x', () => {});\n");

        const r = audit(dir, ["check"]);
        assert.equal(r.scopeConfigured, true);
        assert.equal(r.ok, false);
        assert.ok(r.unaudited.includes("src/app.js"));
        assert.ok(r.unaudited.includes("src/util.js"));
        assert.ok(!r.unaudited.includes("src/app.test.js"), "a test file is never in scope");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("recording clears unaudited; editing an audited file drifts it", () => {
    const dir = project("audit-drift");
    try {
        setScope(dir, ["src/**/*.js"]);
        writeFile(dir, "src/app.js", "export const a = 1;\n");
        run(dir, ["audit", "record", "src/app.js", "--by", "backend"]);
        assert.equal(audit(dir, ["check"]).ok, true);

        writeFile(dir, "src/app.js", "export const a = 2;\n");
        const r = audit(dir, ["check"]);
        assert.equal(r.ok, false);
        assert.ok(r.drifted.includes("src/app.js"));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a file moved out of scope becomes an orphan that prune removes", () => {
    const dir = project("audit-orphan");
    try {
        setScope(dir, ["src/**/*.js"]);
        writeFile(dir, "src/app.js", "export const a = 1;\n");
        writeFile(dir, "src/util.js", "export const b = 2;\n");
        run(dir, ["audit", "record", "src/app.js"]);
        run(dir, ["audit", "record", "src/util.js"]);

        rmSync(join(dir, "src", "util.js"), { force: true });
        const r = audit(dir, ["check"]);
        assert.equal(r.ok, true, "the remaining audited file keeps the gate green");
        assert.ok(r.orphans.includes("src/util.js"));

        run(dir, ["audit", "prune"]);
        assert.equal(run(dir, ["audit", "status"]).count, 1);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
