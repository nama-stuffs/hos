// Acceptance-criteria-first spec: add scaffolds a criteria file, criteria()
// aggregates across areas, lint() flags compound and duplicate criteria, and the
// index reports a criteria count. See doc/protocol/spec.md.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function runRaw(args) {
    try {
        return { status: 0, stdout: text(args) };
    } catch (error) {
        return { status: error.status ?? 1, stdout: error.stdout || "" };
    }
}

// Make a capability's Validation section executable (a test-file anchor), so the
// reconstruction gate can pass once the criteria are clean.
function setExecutableValidation(area, slug) {
    const file = join(dir, ".hos", "doc", "spec", area, `${slug}.md`);
    const text = readFileSync(file, "utf8").replace(/## Validation[\s\S]*$/, `## Validation\n\n- \`node --test test/${area}/${slug}.test.mjs\`\n`);
    writeFileSync(file, text);
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

test("lint flags a code leak: implementation language has no place in a spec", () => {
    text(["spec", "add", "Leaky", "--area", "bad",
        "--acceptance", "the user sees their saved name|the LoginController.save() method writes the users table|render the React component on submit"
    ]);
    const result = json(["spec", "lint"]);
    const leaks = result.issues.filter((i) => i.kind === "code-leak");
    assert.ok(leaks.length >= 2, "the code-identifier, storage, and framework criteria are flagged");
    assert.ok(!leaks.some((i) => /sees their saved name/.test(i.criterion)), "a purely behavioural criterion is not flagged");
});

test("reconstruction readiness gates a spec-only rebuild, and --strict enforces it", () => {
    // A fresh capability with clean behavioural criteria but no executable
    // Validation is not yet rebuildable.
    text(["spec", "add", "Checkout", "--area", "shop",
        "--acceptance", "the cart total is the sum of line prices|an empty cart cannot be submitted|a successful order returns a confirmation code"
    ]);
    let recon = json(["spec", "lint"]).reconstruction;
    const checkout = recon.notReady.find((c) => c.path === "shop/checkout.md");
    assert.ok(checkout.gaps.some((g) => /Validation is not executable/.test(g)), "prose validation is a reconstruction gap");

    // An executable Validation closes the gap for a clean capability.
    setExecutableValidation("shop", "checkout");
    recon = json(["spec", "lint"]).reconstruction;
    assert.ok(!recon.notReady.some((c) => c.path === "shop/checkout.md"), "clean criteria + executable validation is rebuildable");

    // The leaky and unfinished fixtures keep the overall score below 1, so the
    // strict gate fails: a code-free, complete spec is required.
    assert.ok(recon.score < 1, "an incomplete or leaky spec is not fully rebuildable");
    assert.equal(runRaw(["spec", "lint", "--strict"]).status, 1, "--strict exits non-zero while any capability is not rebuildable");
});

test("a spec with only clean, validated capabilities passes the strict gate", () => {
    const solo = join(tmpdir(), `hos-spec-clean-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(solo, { recursive: true });
    try {
        cpSync(join(repoRoot, ".hos"), join(solo, ".hos"), { recursive: true });
        cpSync(join(repoRoot, "AGENTS.md"), join(solo, "AGENTS.md"));
        const run = (args) => execFileSync(process.execPath, [join(solo, ".hos", "tools", "hos.mjs"), ...args], { cwd: solo, encoding: "utf8" });
        run(["init", "--name", "Clean Spec"]);
        run(["spec", "add", "Greeting", "--area", "core",
            "--acceptance", "an empty name yields the greeting 'Hello, world'|a given name yields 'Hello, <name>'|whitespace around the name is trimmed before greeting"
        ]);
        const file = join(solo, ".hos", "doc", "spec", "core", "greeting.md");
        writeFileSync(file, readFileSync(file, "utf8").replace(/## Validation[\s\S]*$/, "## Validation\n\n- `node --test test/core/greeting.test.mjs`\n"));

        const recon = JSON.parse(run(["spec", "lint"])).reconstruction;
        assert.equal(recon.score, 1, "every capability is rebuildable");
        let strict = 0;
        try {
            run(["spec", "lint", "--strict"]);
        } catch (error) {
            strict = error.status ?? 1;
        }
        assert.equal(strict, 0, "--strict passes a clean, complete, code-free spec");
    } finally {
        rmSync(solo, { recursive: true, force: true });
    }
});

test("a stale index heals on re-add and on any spec read", () => {
    // Simulate the loser of a parallel-add race: the file exists, the index row
    // does not.
    const indexPath = join(dir, ".hos", "doc", "spec", "index.md");
    writeFileSync(indexPath, "# Functional Specification\n\n_stale_\n");

    text(["spec", "add", "Login", "--area", "auth"]);
    assert.match(readFileSync(indexPath, "utf8"), /\[Login\]/, "re-adding an existing capability rebuilds the index");

    writeFileSync(indexPath, "# Functional Specification\n\n_stale_\n");
    text(["spec", "list"]);
    assert.match(readFileSync(indexPath, "utf8"), /\[Login\]/, "a spec read converges the derived index");
});
