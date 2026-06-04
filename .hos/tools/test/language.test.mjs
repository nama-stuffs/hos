// Language model: harness-internal text in one consistent language (English by
// default), user-facing communication in the user's language; both configurable.
// See doc/protocol/language.md.

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

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    run(dir, ["init", "--name", "Language Test"]);
    return dir;
}

test("defaults: harness en, user auto", () => {
    const dir = project("lang-default");
    try {
        assert.deepEqual(run(dir, ["language", "show"]), { harness: "en", user: "auto" });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("setting the user language persists; the harness language is untouched", () => {
    const dir = project("lang-user");
    try {
        assert.equal(run(dir, ["language", "set", "--user", "hu"]).user, "hu");
        const shown = run(dir, ["language", "show"]);
        assert.equal(shown.user, "hu");
        assert.equal(shown.harness, "en");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("the harness language can be flipped for a translation experiment", () => {
    const dir = project("lang-harness");
    try {
        assert.equal(run(dir, ["language", "set", "--harness", "hu"]).harness, "hu");
        assert.equal(run(dir, ["language", "show"]).harness, "hu");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
