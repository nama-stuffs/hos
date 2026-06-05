// End-to-end drop-in smoke tests for HOS itself.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENTS_MD, HOS_DIR, REPO_ROOT } from "./paths.mjs";

function fixtureRoot() {
    return mkdtempSync(join(tmpdir(), "hos-dropin-"));
}

// Mirror a real bootstrap: always place .hos/, but only copy the HOS AGENTS.md
// when the target has none. An existing AGENTS.md is a merge decision, not a
// file to clobber (see lib/merge.mjs).
function dropIn(target) {
    cpSync(HOS_DIR, join(target, ".hos"), { recursive: true });
    if (!existsSync(join(target, "AGENTS.md"))) {
        cpSync(AGENTS_MD, join(target, "AGENTS.md"));
    }
}

function runHos(cwd, args) {
    const stdout = execFileSync(process.execPath, [join(cwd, ".hos", "tools", "hos.mjs"), ...args], {
        cwd,
        encoding: "utf8"
    }).trim();
    return parseJson(stdout);
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function assertCheck(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function scenario(name, fn) {
    const dir = fixtureRoot();
    const checks = [];
    const check = (condition, message) => {
        assertCheck(condition, message);
        checks.push(message);
    };

    try {
        fn(dir, check);
        return { name, ok: true, dir, checks };
    } catch (error) {
        return { name, ok: false, dir, checks, error: error.message };
    }
}

function newProjectScenario(dir, check) {
    mkdirSync(dir, { recursive: true });
    dropIn(dir);

    check(!existsSync(join(dir, ".git")), "target is not a Git repository");
    check(!existsSync(join(dir, "README.md")), "README.md is not installed into target root");
    check(runHos(dir, ["status"]).mode === "install", "fresh drop-in reports install mode");

    const init = runHos(dir, ["init", "--name", "Smoke New", "--desc", "drop-in new project"]);
    check(init.generated.written.includes("DESIGN.md"), "init generated DESIGN.md");
    check(init.generated.written.includes("CLAUDE.md"), "init generated CLAUDE.md");
    check(init.generated.written.includes(".gitignore"), "init generated .gitignore");
    check(runHos(dir, ["status"]).mode === "run", "initialized project reports run mode");
    check(runHos(dir, ["doctor"]).ok, "doctor passes after init");

    const specPath = runHos(dir, ["spec", "add", "Smoke Capability", "--area", "smoke"]);
    check(existsSync(specPath), "spec add created a capability file");

    const ticket = runHos(dir, ["ticket", "create", "Smoke task", "--report", "prove ticket flow", "--acceptance", "report renders"]);
    const session = runHos(dir, ["session", "open", "Smoke request"]);
    runHos(dir, ["session", "attach", session, ticket.id, "--reason", "task"]);
    runHos(dir, ["session", "close", session, "--summary", "Smoke complete"]);
    const reports = runHos(dir, ["report", session, "--format", "md"]);
    check(Array.isArray(reports) && reports.every((file) => existsSync(file)), "session report rendered");
}

function adoptScenario(dir, check) {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Host Project\n");
    writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "host",
        scripts: { dev: "vite", build: "tsc", lint: "eslint .", test: "node --test", e2e: "playwright test" }
    }, null, 2));
    dropIn(dir);

    check(!existsSync(join(dir, ".git")), "target is not a Git repository");
    check(runHos(dir, ["status"]).mode === "adopt", "existing project reports adopt mode");
    const adopt = runHos(dir, ["adopt", "--name", "Smoke Existing"]);
    check(adopt.generated.written.includes("DESIGN.md"), "adopt generated DESIGN.md when absent");
    check(readFileSync(join(dir, "README.md"), "utf8") === "# Host Project\n", "adopt preserved host README.md");

    const settings = JSON.parse(readFileSync(join(dir, ".hos", "hos.json"), "utf8"));
    check(settings.runtime.install === "npm install", "adopt detected npm install");
    check(settings.runtime.dev === "npm run dev", "adopt detected dev script");
    check(settings.runtime.build === "npm run build", "adopt detected build script");
    check(settings.checks.lint === "npm run lint", "adopt detected lint script");
    check(settings.checks.unit === "npm test", "adopt detected unit script");
    check(settings.checks.e2e === "npm run e2e", "adopt detected e2e script");
    check(runHos(dir, ["doctor"]).ok, "doctor passes after adopt");
}

function preserveScenario(dir, check) {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Keep Me\n");
    writeFileSync(join(dir, "DESIGN.md"), "# Existing Design\n");
    writeFileSync(join(dir, "CLAUDE.md"), "See AGENTS.md.\n");
    writeFileSync(join(dir, ".gitignore"), "dist/\n");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "host", scripts: { test: "node --test" } }, null, 2));
    dropIn(dir);

    check(!existsSync(join(dir, ".git")), "target is not a Git repository");
    const localPolicy = join(dir, ".hos", "memory", "policy", "local-preserve-rule.md");
    writeFileSync(localPolicy, "---\ntitle: Local preserve rule\nscope: local\nstatus: active\ntriggers: [preserve]\n---\n\nKeep me.\n");

    runHos(dir, ["adopt", "--name", "Preserve Existing"]);
    check(readFileSync(join(dir, "README.md"), "utf8") === "# Keep Me\n", "README.md was preserved");
    check(readFileSync(join(dir, "DESIGN.md"), "utf8") === "# Existing Design\n", "DESIGN.md was preserved");
    check(readFileSync(join(dir, "CLAUDE.md"), "utf8") === "See AGENTS.md.\n", "CLAUDE.md was preserved");
    check(readFileSync(join(dir, ".gitignore"), "utf8").includes(".hos/reports/"), ".gitignore gained HOS block");
    check(existsSync(localPolicy), "existing harness memory policy was preserved");
    check(runHos(dir, ["doctor"]).ok, "doctor passes after preservation adopt");
}

// A project that already has its own AGENTS.md (a pre-existing harness). HOS must
// not overwrite it: the merge is Inter-driven, and `append` keeps host content
// while adding a marked HOS section, idempotently.
function existingHarnessMergeScenario(dir, check) {
    const hostAgents = "# My Agents\n\nHouse rule: ship small.\n";
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "host", scripts: { test: "node --test" } }, null, 2));
    writeFileSync(join(dir, "AGENTS.md"), hostAgents);
    dropIn(dir);

    check(readFileSync(join(dir, "AGENTS.md"), "utf8") === hostAgents, "drop-in preserved the host AGENTS.md");

    const plan = runHos(dir, ["merge", "agents"]);
    check(plan.state === "has-content" && plan.action === "ask", "merge plan asks the user how to join an existing AGENTS.md");

    runHos(dir, ["adopt", "--name", "Merge Existing"]);
    const applied = runHos(dir, ["merge", "agents", "--apply", "append"]);
    const merged = readFileSync(join(dir, "AGENTS.md"), "utf8");

    check(applied.strategy === "append", "append strategy applied");
    check(merged.includes("House rule: ship small."), "host AGENTS.md content preserved through merge");
    check(merged.includes("## HOS"), "HOS section appended to AGENTS.md");

    runHos(dir, ["merge", "agents", "--apply", "append"]);
    const after = readFileSync(join(dir, "AGENTS.md"), "utf8");
    check((after.match(/## HOS/g) || []).length === 1, "merge is idempotent (one HOS section)");
    check(runHos(dir, ["doctor"]).ok, "doctor passes after merge adopt");
}

// A project that fell behind the framework. `hos upgrade` re-syncs framework
// files from a fresh release (the source repo) while preserving tickets, memory,
// spec, and hos.json values - and never deletes project-added files.
function upgradeScenario(dir, check) {
    mkdirSync(dir, { recursive: true });
    dropIn(dir);
    runHos(dir, ["init", "--name", "Smoke Upgrade"]);

    const settingsPath = join(dir, ".hos", "hos.json");
    const aged = JSON.parse(readFileSync(settingsPath, "utf8"));
    aged.hos.version = "0.0.1";
    writeFileSync(settingsPath, JSON.stringify(aged, null, 2));
    // Remove a shipped framework file: the three-way merge classifies it "add" and
    // restores it (a locally MODIFIED file would instead be kept - see upgrade.md).
    rmSync(join(dir, ".hos", "persona", "ui.md"), { force: true });

    const ticket = runHos(dir, ["ticket", "create", "Keep me through upgrade"]);

    const plan = runHos(dir, ["upgrade", "--from", REPO_ROOT]);
    check(plan.ok && plan.applied === false, "upgrade dry-run reports a plan without writing");
    check(plan.plan.some((p) => p.file === "persona/ui.md" && p.action === "add"), "dry-run flags the missing framework file");

    const applied = runHos(dir, ["upgrade", "--from", REPO_ROOT, "--apply"]);
    check(applied.applied === true, "upgrade --apply runs");
    check(existsSync(join(dir, ".hos", "persona", "ui.md")), "missing framework file restored");
    check(JSON.parse(readFileSync(settingsPath, "utf8")).hos.version === plan.fromVersion, "hos.version bumped to the release");
    check(existsSync(join(dir, ".hos", "tickets", ticket.id, "ticket.md")), "ticket preserved through upgrade");
    check(runHos(dir, ["doctor"]).ok, "doctor passes after upgrade");
}

export function smoke({ keep = false } = {}) {
    const results = [
        scenario("new-project-drop-in", newProjectScenario),
        scenario("existing-project-adopt", adoptScenario),
        scenario("existing-files-preserved", preserveScenario),
        scenario("existing-harness-merge", existingHarnessMergeScenario),
        scenario("upgrade-resync", upgradeScenario)
    ];
    const ok = results.every((result) => result.ok);

    for (const result of results) {
        if (!keep && result.ok) {
            rmSync(result.dir, { recursive: true, force: true });
            result.dir = null;
        }
    }

    return {
        ok,
        summary: `${results.filter((result) => result.ok).length}/${results.length} smoke scenarios passed`,
        kept: keep || !ok,
        scenarios: results
    };
}
