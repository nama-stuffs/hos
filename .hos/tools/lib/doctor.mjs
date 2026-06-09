// Self-check for structure, settings, links, and memory.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENTS_MD, HOS_DIR, HOS_JSON, MEMORY_DIR, REPO_ROOT, SPEC_DIR, TICKETS_DIR } from "./paths.mjs";
import { isInitialized } from "./config.mjs";
import { bootstrapPresent, isSourceRepo } from "./install-files.mjs";
import { HOS_VERSION } from "./meta.mjs";
import { doctorCheck as workflowDoctorCheck } from "./workflow.mjs";

const REQUIRED = [
    "persona/inter.md", "persona/alpha.md", "persona/architect.md",
    "persona/frontend.md", "persona/backend.md",
    "persona/optimizer.md", "persona/curator.md",
    "doc/protocol/orchestration.md", "doc/protocol/memory.md", "doc/protocol/task.md",
    "doc/protocol/spec.md", "doc/protocol/report.md", "doc/protocol/session.md",
    "doc/protocol/testing.md", "doc/protocol/bench.md", "doc/protocol/upgrade.md",
    "doc/protocol/parallel.md", "doc/protocol/retrospective.md", "doc/protocol/audit.md",
    "doc/protocol/language.md", "doc/accelerators.md",
    "doc/audit/code.md", "doc/audit/design.md", "doc/audit/ux.md",
    "doc/audit/doc.md", "doc/audit/harness.md",
    "accelerators/registry.json", "agents.template.md", "tools/hos.mjs",
    "tools/lib/workflow.mjs",
    "task/self-optimization.md", "task/code-optimization.md", "task/audit.md"
];

// In the source repo the shipped agent template must equal the root AGENTS.md, so
// adopted projects receive the same entry. Line endings are normalized first.
function agentsTemplateInSync() {
    const template = join(HOS_DIR, "agents.template.md");
    if (!existsSync(template) || !existsSync(AGENTS_MD)) {
        return false;
    }
    const norm = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    return norm(template) === norm(AGENTS_MD);
}

// The root package.json version must match the shipped framework version, so the
// recorded version and the harness it reports agree.
function packageVersionInSync() {
    const pkg = join(REPO_ROOT, "package.json");
    if (!existsSync(pkg)) {
        return true;
    }
    try {
        return JSON.parse(readFileSync(pkg, "utf8")).version === HOS_VERSION;
    } catch {
        return false;
    }
}

function check(name, ok, detail = "") {
    return { name, ok: Boolean(ok), detail };
}

// Every .hos/... and root-doc markdown link in the docs must resolve.
function brokenLinks() {
    const broken = [];
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            return walk(p);
        }
        if (!e.name.endsWith(".md")) {
            return;
        }
        const text = readFileSync(p, "utf8");
        for (const m of text.matchAll(/\]\((\.hos\/[A-Za-z0-9/_.-]+|AGENTS\.md|DESIGN\.md|todo\.md)\)/g)) {
            if (!existsSync(join(REPO_ROOT, m[1]))) {
                broken.push(`${relative(REPO_ROOT, p)} -> ${m[1]}`);
            }
        }
    });
    [HOS_DIR, REPO_ROOT].forEach((d) => existsSync(d) && walk(d === REPO_ROOT ? REPO_ROOT : d));
    return [...new Set(broken)];
}

function staleHarnessWording() {
    const hits = [];
    const oldName = "harness";
    const patterns = [
        new RegExp(`usage:\\s*${oldName}`, "i"),
        new RegExp(`${oldName}:\\s*\\$\\{?m`, "i"),
        new RegExp(`The \`${oldName}\` CLI`, "i")
    ];
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            return walk(p);
        }
        if (!/\.(md|mjs)$/.test(e.name)) {
            return;
        }
        if (relative(REPO_ROOT, p).replaceAll("\\", "/") === ".hos/tools/lib/doctor.mjs") {
            return;
        }
        const text = readFileSync(p, "utf8");
        if (patterns.some((pattern) => pattern.test(text))) {
            hits.push(relative(REPO_ROOT, p));
        }
    });
    walk(HOS_DIR);
    return hits;
}

function claudePointerOk() {
    const file = join(REPO_ROOT, "CLAUDE.md");
    return !existsSync(file) || /AGENTS\.md/.test(readFileSync(file, "utf8"));
}

function benchReady() {
    const scenarios = join(HOS_DIR, "doc", "bench", "scenarios");
    return existsSync(join(HOS_DIR, "doc", "bench", "baseline.json"))
        && existsSync(scenarios)
        && readdirSync(scenarios).some((file) => file.endsWith(".md"));
}

// The audit ledger is optional project state, but if present it must be valid
// JSON so `hos audit` can read it.
function auditLedgerOk() {
    const file = join(HOS_DIR, "audit", "ledger.json");
    if (!existsSync(file)) {
        return true;
    }
    try {
        JSON.parse(readFileSync(file, "utf8"));
        return true;
    } catch {
        return false;
    }
}

function ignoreRulesOk() {
    const file = join(REPO_ROOT, ".gitignore");
    if (!existsSync(file)) {
        return false;
    }
    const text = readFileSync(file, "utf8");
    return [".hos/.cache/", ".hos/reports/", ".hos/tickets/*/evidence/", ".hos/tickets/*/claim.json"]
        .every((rule) => text.includes(rule));
}

export function doctor() {
    const checks = [];
    const initialized = isInitialized();

    checks.push(check("AGENTS.md present", existsSync(AGENTS_MD)));
    checks.push(check("hos.json present", existsSync(HOS_JSON)));

    const missing = REQUIRED.filter((r) => !existsSync(join(HOS_DIR, r)));
    checks.push(check("core files present", missing.length === 0, missing.join(", ")));

    let settingsOk = false;
    try {
        JSON.parse(readFileSync(HOS_JSON, "utf8"));
        settingsOk = true;
    } catch (err) {
        settingsOk = false;
    }
    checks.push(check("hos.json parses", settingsOk));

    checks.push(check("memory store present", existsSync(MEMORY_DIR)));
    checks.push(check("tickets dir present", existsSync(TICKETS_DIR)));
    checks.push(check("spec dir present", existsSync(SPEC_DIR)));

    checks.push(check("bootstrap installer available when uninitialized", initialized || bootstrapPresent()));
    checks.push(check(
        "source root has no generated target files before init",
        initialized || (!existsSync(join(REPO_ROOT, "DESIGN.md")) && !existsSync(join(REPO_ROOT, "CLAUDE.md")))
    ));
    checks.push(check("DESIGN.md generated when initialized", !initialized || existsSync(join(REPO_ROOT, "DESIGN.md"))));
    checks.push(check("CLAUDE.md absent or points to AGENTS.md", claudePointerOk()));
    checks.push(check("agent template matches AGENTS.md (source repo)", !isSourceRepo() || agentsTemplateInSync()));
    checks.push(check("package.json version matches HOS_VERSION (source repo)", !isSourceRepo() || packageVersionInSync()));
    checks.push(check("benchmark baseline and scenarios present", benchReady()));
    checks.push(check("audit ledger parses when present", auditLedgerOk()));

    const broken = brokenLinks();
    checks.push(check("no broken doc links", broken.length === 0, broken.slice(0, 5).join(" | ")));

    checks.push(check("local artifact ignore rules present", ignoreRulesOk()));

    const stale = staleHarnessWording();
    checks.push(check("no stale harness CLI wording", stale.length === 0, stale.slice(0, 5).join(" | ")));

    const workflow = workflowDoctorCheck();
    checks.push(check("verified tickets satisfy workflow gate", workflow.ok, workflow.detail));

    const ok = checks.every((c) => c.ok);
    return {
        ok,
        summary: `${checks.filter((c) => c.ok).length}/${checks.length} checks passed`,
        ticketsReady: existsSync(TICKETS_DIR),
        specReady: existsSync(SPEC_DIR),
        checks
    };
}
