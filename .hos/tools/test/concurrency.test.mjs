// Multi-agent concurrency: any number of hos processes may write at once. The
// shared surfaces - ticket id allocation, run capture, session ids, settings,
// and the derived indexes - must neither tear nor drop a concurrent update.
// Every test here spawns real parallel CLI processes, not in-process calls.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const run = promisify(execFile);

function project(name) {
    const dir = join(tmpdir(), `hos-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
    cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));
    execFileSync(process.execPath, [join(dir, ".hos", "tools", "hos.mjs"), "init", "--name", "Concurrency Test"], { cwd: dir });
    return dir;
}

// Windows can hold handles in the tree (a virus scanner on just-written
// files) past any sane retry window. Teardown is best-effort: every assertion
// has already run, and a leftover temp tree is harmless.
function cleanup(dir) {
    try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    } catch {
        // leave the temp tree to the OS cleaner
    }
}

// One hos invocation as a child process; resolves with parsed stdout JSON.
async function hos(dir, args) {
    const { stdout } = await run(process.execPath, [join(dir, ".hos", "tools", "hos.mjs"), ...args], { cwd: dir, encoding: "utf8" });
    return stdout;
}

const json = async (dir, args) => JSON.parse(await hos(dir, args));

test("parallel creates with one title allocate distinct tickets and a complete index", async () => {
    const dir = project("conc-create");
    try {
        const results = await Promise.all(
            Array.from({ length: 5 }, () => json(dir, ["ticket", "create", "Same title race", "--acceptance", "Race lands."]))
        );

        const ids = new Set(results.map((r) => r.id));
        assert.equal(ids.size, 5, "five concurrent creates allocate five distinct ids");

        const index = readFileSync(join(dir, ".hos", "tickets", "index.md"), "utf8");
        for (const id of ids) {
            assert.ok(index.includes(`| ${id} |`), `the index carries ${id} without a manual re-sync`);
        }
    } finally {
        cleanup(dir);
    }
});

test("parallel runs on one ticket each keep their own capture file", async () => {
    const dir = project("conc-runs");
    try {
        const id = (await json(dir, ["ticket", "create", "Deep log race", "--acceptance", "Runs land."])).id;
        await Promise.all([
            hos(dir, ["run", id, "--by", "a", "--", "echo", "one"]),
            hos(dir, ["run", id, "--by", "b", "--", "echo", "two"]),
            hos(dir, ["run", id, "--by", "c", "--", "echo", "three"])
        ]);

        const logDir = join(dir, ".hos", "tickets", id, "log");
        const outs = readdirSync(logDir).filter((f) => /^run-\d+\.out$/.test(f));
        assert.equal(outs.length, 3, "three captures, three files - none overwritten");

        const runs = readFileSync(join(logDir, "runs.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
        assert.equal(runs.length, 3);
        assert.equal(new Set(runs.map((r) => r.out)).size, 3, "each ndjson entry points at its own capture");
    } finally {
        cleanup(dir);
    }
});

test("parallel session opens with one request stay distinct sessions", async () => {
    const dir = project("conc-sessions");
    try {
        const ids = await Promise.all(
            Array.from({ length: 4 }, async () => (await hos(dir, ["session", "open", "Fix the login button"])).trim())
        );
        assert.equal(new Set(ids).size, 4, "no two agents share a session id");
    } finally {
        cleanup(dir);
    }
});

test("parallel settings patches compose instead of tearing hos.json", async () => {
    const dir = project("conc-settings");
    try {
        await Promise.all([
            hos(dir, ["autonomy", "set", "high"]),
            hos(dir, ["language", "set", "--harness", "en"]),
            hos(dir, ["language", "set", "--user", "hu"]),
            hos(dir, ["autonomy", "set", "medium"]),
            hos(dir, ["autonomy", "set", "high"])
        ]);

        const settings = JSON.parse(readFileSync(join(dir, ".hos", "hos.json"), "utf8"));
        assert.ok(["low", "medium", "high"].includes(settings.autonomy.granted), "the grant is one of the written values");
        assert.equal(settings.language.harness, "en", "the language patch was not lost to the autonomy patches");
        assert.equal(settings.language.user, "hu");
        assert.equal(settings.project.name, "Concurrency Test", "untouched sections survive every patch");
    } finally {
        cleanup(dir);
    }
});

test("parallel spec adds converge to a complete index without a manual re-sync", async () => {
    const dir = project("conc-spec");
    try {
        await Promise.all([
            hos(dir, ["spec", "add", "Pattern Generator", "--area", "generation"]),
            hos(dir, ["spec", "add", "Pattern Catalog", "--area", "catalog"]),
            hos(dir, ["spec", "add", "Book Generation", "--area", "book"])
        ]);

        const index = readFileSync(join(dir, ".hos", "doc", "spec", "index.md"), "utf8");
        for (const title of ["Pattern Generator", "Pattern Catalog", "Book Generation"]) {
            assert.ok(index.includes(title), `${title} is in the index right after the adds return`);
        }
    } finally {
        cleanup(dir);
    }
});

test("racing drains deliver each message exactly once", async () => {
    const dir = project("conc-inbox");
    try {
        for (let i = 0; i < 6; i++) {
            await hos(dir, ["msg", "send", `steer ${i}`, "--to", "alpha"]);
        }
        const [a, b] = await Promise.all([
            json(dir, ["msg", "drain", "--to", "alpha"]),
            json(dir, ["msg", "drain", "--to", "alpha"])
        ]);

        const texts = [...a, ...b].map((m) => m.text).sort();
        assert.equal(texts.length, 6, "every message is delivered to exactly one drainer");
        assert.deepEqual(texts, Array.from({ length: 6 }, (_, i) => `steer ${i}`).sort());
        assert.equal((await json(dir, ["msg", "list", "--to", "alpha"])).length, 0, "the inbox is empty afterwards");
    } finally {
        cleanup(dir);
    }
});
