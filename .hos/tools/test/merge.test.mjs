// Unit tests for the AGENTS.md adoption merge. Runs against a disposable root so
// it never touches the real repo: HOS_DIR is set before the modules load, and
// AGENTS_MD resolves to <HOS_DIR>/../AGENTS.md inside the temp tree.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "hos-mergetest-"));
mkdirSync(join(root, ".hos"), { recursive: true });
process.env.HOS_DIR = join(root, ".hos");

const { planAgentsMerge, applyAgentsMerge } = await import("../lib/merge.mjs");
const { AGENTS_MD } = await import("../lib/paths.mjs");

const HOS_AGENTS = "# AGENTS.md\n\nHOS source entry point.\n";

after(() => rmSync(root, { recursive: true, force: true }));

function resetTarget(content) {
    if (content === null) {
        if (existsSync(AGENTS_MD)) {
            rmSync(AGENTS_MD);
        }
    } else {
        writeFileSync(AGENTS_MD, content);
    }
}

test("absent host file plans copy and apply writes HOS verbatim", () => {
    resetTarget(null);
    assert.equal(planAgentsMerge().state, "absent");

    const result = applyAgentsMerge({ strategy: "append", hosAgents: HOS_AGENTS });
    assert.equal(result.state, "absent");
    assert.equal(readFileSync(AGENTS_MD, "utf8"), HOS_AGENTS);
});

test("the canonical HOS AGENTS.md is recognized, not treated as host content", () => {
    // The README install copies HOS's own AGENTS.md in before adopt runs; the
    // plan must not ask how to merge HOS with itself.
    resetTarget("# AGENTS.md\n\nHOS is a file-based agent harness under `.hos/`. Any agent that can read files\nand run a shell can use it.\n");
    const plan = planAgentsMerge();
    assert.equal(plan.state, "already-hos");
    assert.equal(plan.action, "noop");

    writeFileSync(join(root, ".hos", "agents.template.md"), "# AGENTS.md\n\nTemplate body.\n");
    try {
        resetTarget("# AGENTS.md\n\nTemplate body.\n");
        assert.equal(planAgentsMerge().state, "already-hos", "an exact template copy is HOS's own file");
        resetTarget("# My Project Agents\n\nDo the thing.\n");
        assert.equal(planAgentsMerge().state, "has-content", "host content still asks when a template exists");
    } finally {
        rmSync(join(root, ".hos", "agents.template.md"), { force: true });
    }
});

test("host content plans a question with strategy options", () => {
    resetTarget("# My Project Agents\n\nDo the thing.\n");
    const plan = planAgentsMerge();

    assert.equal(plan.state, "has-content");
    assert.equal(plan.action, "ask");
    assert.equal(plan.questions[0].recommended, "append");
    assert.deepEqual(plan.questions[0].options.map((o) => o.id), ["append", "hos-primary", "manual"]);
});

test("append preserves host content and adds the marked HOS section", () => {
    const host = "# My Project Agents\n\nDo the thing.\n";
    resetTarget(host);

    const result = applyAgentsMerge({ strategy: "append", hosAgents: HOS_AGENTS });
    const merged = readFileSync(AGENTS_MD, "utf8");

    assert.equal(result.strategy, "append");
    assert.match(merged, /Do the thing\./);    // host content preserved
    assert.match(merged, /## HOS/);             // HOS section added
    assert.match(merged, /HOS:begin/);          // fenced for idempotency
});

test("append is idempotent and does not stack duplicate sections", () => {
    resetTarget("# My Project Agents\n\nDo the thing.\n");

    applyAgentsMerge({ strategy: "append", hosAgents: HOS_AGENTS });
    const second = applyAgentsMerge({ strategy: "append", hosAgents: HOS_AGENTS });
    const merged = readFileSync(AGENTS_MD, "utf8");

    assert.equal(second.state, "already-hos");
    assert.equal(second.strategy, "noop");
    assert.equal(merged.match(/## HOS/g).length, 1, "exactly one HOS section");
});

test("hos-primary preserves the host file as AGENTS.local.md", () => {
    const host = "# My Project Agents\n\nHost rules.\n";
    resetTarget(host);

    const result = applyAgentsMerge({ strategy: "hos-primary", hosAgents: HOS_AGENTS });
    const local = AGENTS_MD.replace(/AGENTS\.md$/, "AGENTS.local.md");

    assert.equal(result.strategy, "hos-primary");
    assert.equal(readFileSync(AGENTS_MD, "utf8"), HOS_AGENTS);
    assert.equal(readFileSync(local, "utf8"), host);
});

test("manual makes no change to the host file", () => {
    const host = "# My Project Agents\n\nHands off.\n";
    resetTarget(host);

    const result = applyAgentsMerge({ strategy: "manual", hosAgents: HOS_AGENTS });
    assert.equal(result.strategy, "manual");
    assert.equal(readFileSync(AGENTS_MD, "utf8"), host);
});
