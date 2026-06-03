// Runner-independent test entry point. Wraps `node --test` so the documented
// command is `hos test` everywhere: no npm, no package.json, nothing tied to a
// single package manager. Bun or another runner can call the same files; this
// just spawns the current Node binary against the test directory.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TOOLS_DIR } from "./paths.mjs";

const TEST_DIR = join(TOOLS_DIR, "test");

function testFiles() {
    return existsSync(TEST_DIR)
        ? readdirSync(TEST_DIR).filter((f) => f.endsWith(".test.mjs")).map((f) => join(TEST_DIR, f))
        : [];
}

// Run every *.test.mjs under tools/test with the current runtime's test runner.
// Returns the child exit code so the CLI can propagate pass/fail.
export function runTests() {
    const files = testFiles();
    if (!files.length) {
        process.stderr.write("hos test: no test files found\n");
        return 1;
    }

    const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
    return result.status ?? 1;
}
