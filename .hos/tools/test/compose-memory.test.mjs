// A composed persona unions its lenses' persona-scoped memory: compose
// architect+frontend surfaces both namespaces' standing entries, even when the
// keyword search would not match them. See doc/protocol/memory.md.

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

// memory add prints a path and compose prints prompt text - neither is JSON.
function raw(dir, args) {
    return execFileSync(process.execPath, [tool(dir), ...args], { cwd: dir, encoding: "utf8" });
}

function project(name) {
    const dir = tempDir(name);
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    raw(dir, ["init", "--name", "Compose Memory Test"]);
    return dir;
}

test("compose unions persona-scoped memory across its lenses", () => {
    const dir = project("compose-mem");
    try {
        // Titles deliberately share no token with "architect" or "frontend", so the
        // keyword search cannot surface them - only the namespace union can.
        raw(dir, ["memory", "add", "Prefer composition over inheritance",
            "--scope", "persona/architect", "--trigger", "zzznomatch"]);
        raw(dir, ["memory", "add", "Use design tokens only",
            "--scope", "persona/frontend", "--trigger", "zzznomatch"]);

        const prompt = raw(dir, ["compose", "architect+frontend"]);
        assert.match(prompt, /composition over inheritance/, "architect namespace memory is composed");
        assert.match(prompt, /design tokens only/, "frontend namespace memory is composed");

        // A lens that was not composed must not leak its namespace memory.
        const backendOnly = raw(dir, ["compose", "backend"]);
        assert.doesNotMatch(backendOnly, /composition over inheritance/, "uncomposed lens memory does not leak");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
