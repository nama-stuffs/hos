// Regression coverage for CLI commands that had none: compose (prompt
// assembly), graph impact, report --format html, and version/changedSince.

import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let dir;

before(() => {
    dir = join(tmpdir(), `hos-cmds-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    text(["init", "--name", "Cmd Proof"]);
});

after(() => rmSync(dir, { recursive: true, force: true }));

function text(args) {
    return execFileSync(process.execPath, [join(dir, ".hos", "tools", "hos.mjs"), ...args], {
        cwd: dir,
        encoding: "utf8"
    });
}

function json(args) {
    return JSON.parse(text(args));
}

test("compose assembles AGENTS.md plus the named lenses into one prompt", () => {
    const out = text(["compose", "architect+backend"]);
    assert.match(out, /file-based agent harness/);   // AGENTS.md content
    assert.match(out, /Architect/);                  // architect lens
    assert.match(out, /Backend/);                     // backend lens
    assert.match(out, /\n---\n/);                     // sections are joined
});

test("compose injects matching say-once policies", () => {
    text(["memory", "add", "Prefer composed proof", "--trigger", "architect,backend,compose"]);
    const out = text(["compose", "architect+backend"]);
    assert.match(out, /Active policies/);
});

test("graph impact returns referrers with forward-slash paths", () => {
    const result = json(["graph", "impact", ".hos/tools/lib/util.mjs"]);
    assert.equal(result.target, ".hos/tools/lib/util.mjs");
    assert.ok(result.count > 0, "util.mjs has referrers");
    assert.ok(result.referencedBy.every((p) => !p.includes("\\")), "no backslash paths");
});

test("report --format html renders a self-contained HTML file", () => {
    const session = text(["session", "open", "Prove HTML report"]).trim();
    const ticket = json(["ticket", "create", "HTML ticket"]);
    text(["session", "attach", session, ticket.id, "--reason", "task"]);
    text(["session", "close", session, "--summary", "done"]);

    const written = json(["report", session, "--format", "html"]);
    assert.equal(written.length, 1);
    assert.match(written[0], /\.html$/);
    assert.ok(!written[0].includes("\\"), "report path is normalized");

    const html = readFileSync(written[0], "utf8");
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /Prove HTML report/);
});

test("version is a stable hash with normalized paths; changedSince detects drift", async () => {
    const { version, changedSince } = await import("../lib/version.mjs");
    const snapshot = version();
    assert.match(snapshot.version, /^[0-9a-f]{12}$/);
    assert.ok(snapshot.files > 0);
    assert.ok(snapshot.parts.every((p) => !p.file.includes("\\")), "no backslash paths");
    assert.deepEqual(changedSince(snapshot.parts), [], "unchanged snapshot reports no drift");
    assert.ok(changedSince([]).length > 0, "an empty prior snapshot marks every file changed");
});
