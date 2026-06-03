// Acceptance-criteria-first spec: add scaffolds a criteria file, criteria()
// aggregates across areas, lint() flags compound and duplicate criteria, and the
// index reports a criteria count. See doc/protocol/spec.md.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let dir;

before(() => {
    dir = join(tmpdir(), `hos-spec-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    text(["init", "--name", "Spec Test"]);
});

after(() => rmSync(dir, { recursive: true, force: true }));

function text(args) {
    return execFileSync(process.execPath, [join(dir, ".hos", "tools", "hos.mjs"), ...args], { cwd: dir, encoding: "utf8" });
}

function json(args) {
    return JSON.parse(text(args));
}

test("spec add scaffolds an acceptance-criteria file", () => {
    const path = text(["spec", "add", "Login", "--area", "auth",
        "--acceptance", "user can sign in and a session starts|invalid password shows an error|invalid password shows an error"
    ]).trim();
    const body = readFileSync(path, "utf8");
    assert.match(body, /## Acceptance Criteria/);
    assert.match(body, /- \[ \] user can sign in and a session starts/);
    assert.doesNotMatch(body, /## Behavior/, "Behavior is folded into criteria, not a separate section");
});

test("criteria collects every assertion across areas", () => {
    const caps = json(["spec", "criteria"]);
    const login = caps.find((c) => c.capability === "Login");
    assert.ok(login, "the Login capability is collected");
    assert.equal(login.area, "auth");
    assert.equal(login.criteria.length, 3, "all three criteria are parsed, placeholder excluded");
});

test("lint flags compound and duplicate criteria", () => {
    const result = json(["spec", "lint"]);
    assert.ok(result.total >= 3);
    assert.ok(result.issues.some((i) => i.kind === "compound"), "the 'and' criterion is flagged compound");
    assert.ok(result.issues.some((i) => i.kind === "duplicate"), "the repeated criterion is flagged duplicate");
});

test("the index reports a criteria count column", () => {
    text(["spec", "index"]);
    const index = readFileSync(join(dir, ".hos", "doc", "spec", "index.md"), "utf8");
    assert.match(index, /\| Capability \| Area \| Criteria \| Status \|/);
    assert.match(index, /\| \[Login\]\(auth\/login\.md\) \| `auth` \| 3 \|/);
});
