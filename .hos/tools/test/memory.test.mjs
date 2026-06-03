// Unit tests for the say-once memory core.
//
// These run against a disposable store: HOS_DIR is pointed at a temp directory
// BEFORE the harness modules load, so the tests never read or write the real
// .hos/memory/ folder. That keeps them deterministic and avoids racing the
// drop-in smoke test for the same files on Windows (EBUSY).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the harness at a throwaway store, then load the modules that read it.
const store = mkdtempSync(join(tmpdir(), "hos-memtest-"));
mkdirSync(join(store, ".hos"), { recursive: true });
process.env.HOS_DIR = join(store, ".hos");

const memory = await import("../lib/memory.mjs");
const { tokenize } = memory;
const { POLICY_DIR } = await import("../lib/paths.mjs");

before(() => {
    memory.rebuildIndex();
});

after(() => {
    rmSync(store, { recursive: true, force: true });
});

// Each test cleans up the policies it created so the next one starts clean.
const created = [];
function cleanup() {
    for (const file of created) {
        if (existsSync(file)) {
            rmSync(file);
        }
    }
    created.length = 0;
    memory.rebuildIndex();
}

test("tokenize drops stopwords and short tokens", () => {
    const tokens = tokenize("Always use the Bun runtime for a new module");
    assert.ok(tokens.includes("bun"));
    assert.ok(tokens.includes("runtime"));
    assert.ok(tokens.includes("module"));
    assert.ok(!tokens.includes("the"));
    assert.ok(!tokens.includes("a"));
    assert.ok(!tokens.includes("use")); // stopword
});

test("a policy added once is retrieved by related ticket text", () => {
    const file = memory.addPolicy({
        title: "TEST API fields use snake_case",
        body: "Every endpoint returns snake_case fields.",
        scope: "code/server",
        triggers: ["api", "field", "snake", "endpoint", "json"],
        source: "user"
    });
    created.push(file);

    const hits = memory.search("the new endpoint should return json fields");
    assert.ok(hits.some((p) => p.title === "TEST API fields use snake_case"), "policy should surface for related text");
    cleanup();
});

test("scope narrows the result set", () => {
    created.push(memory.addPolicy({ title: "TEST server only rule", body: "x", scope: "code/server", triggers: ["widget"] }));
    created.push(memory.addPolicy({ title: "TEST client only rule", body: "y", scope: "code/client", triggers: ["widget"] }));

    const serverHits = memory.search("widget", { scope: "code/server" });
    assert.ok(serverHits.some((p) => p.title === "TEST server only rule"));
    assert.ok(!serverHits.some((p) => p.title === "TEST client only rule"), "client-scoped policy must not match a server-scoped search");
    cleanup();
});

test("unrelated text returns no policy", () => {
    created.push(memory.addPolicy({ title: "TEST payments rule", body: "z", scope: "code", triggers: ["payment", "invoice"] }));
    assert.equal(memory.search("change the footer background color").length, 0);
    cleanup();
});

test("adding a policy writes one file into the store", () => {
    const before = readdirSync(POLICY_DIR).length;
    created.push(memory.addPolicy({ title: "TEST sequential id", body: "a", triggers: ["seqtest"] }));
    assert.equal(readdirSync(POLICY_DIR).length, before + 1);
    cleanup();
});
