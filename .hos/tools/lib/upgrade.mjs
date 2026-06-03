// hos upgrade: re-sync framework-owned files from a newer HOS release while
// preserving every project-owned path. Additive/overwrite only - it never
// deletes - so project-added audits, personas, or scenarios survive.
// See doc/protocol/upgrade.md.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { HOS_DIR } from "./paths.mjs";
import { settings, patchSettings } from "./config.mjs";
import { isSourceRepo } from "./install-files.mjs";
import * as memory from "./memory.mjs";
import * as ledger from "./ledger.mjs";
import * as spec from "./spec.mjs";

// Whole directories that belong to the framework, plus individual framework
// files that live beside project state. Everything else under .hos/ is the
// project's and is left untouched.
const FRAMEWORK_DIRS = ["persona", "doc/protocol", "doc/audit", "tools"];
const FRAMEWORK_FILES = [
    "agents.template.md",
    "doc/accelerators.md",
    "bootstrap.md",
    "install.md",
    "memory/README.md",
    "tickets/README.md",
    "task/README.md",
    "doc/spec/README.md"
];

const norm = (text) => text.replace(/\r\n/g, "\n");

function walk(dir, base, acc) {
    if (!existsSync(dir)) {
        return acc;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, base, acc);
        } else {
            acc.push(relative(base, full).replaceAll("\\", "/"));
        }
    }
    return acc;
}

// Every framework file a given .hos root ships, as forward-slash paths relative
// to that root.
function frameworkFiles(hosRoot) {
    const files = [];
    for (const dir of FRAMEWORK_DIRS) {
        walk(join(hosRoot, dir), hosRoot, files);
    }
    for (const file of FRAMEWORK_FILES) {
        if (existsSync(join(hosRoot, file))) {
            files.push(file);
        }
    }
    return [...new Set(files)].sort();
}

function readVersionFrom(hosRoot) {
    const metaPath = join(hosRoot, "tools", "lib", "meta.mjs");
    const match = existsSync(metaPath) && /HOS_VERSION\s*=\s*["']([^"']+)["']/.exec(readFileSync(metaPath, "utf8"));
    return match ? match[1] : null;
}

const parseSemver = (v) => String(v || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);

function compareSemver(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) {
            return pa[i] - pb[i];
        }
    }
    return 0;
}

function classify(freshHos, files) {
    return files.map((file) => {
        const target = join(HOS_DIR, file);
        if (!existsSync(target)) {
            return { file, action: "add" };
        }
        const same = norm(readFileSync(join(freshHos, file), "utf8")) === norm(readFileSync(target, "utf8"));
        return { file, action: same ? "unchanged" : "update" };
    });
}

export function upgrade({ from = "", apply = false, force = false } = {}) {
    if (isSourceRepo() && !force) {
        return { ok: false, error: "upgrade refuses to run in the HOS source repo (use --force to override)" };
    }
    if (!from || from === true) {
        return { ok: false, error: "upgrade needs --from <path-to-fresh-hos> (a checkout of the new release)" };
    }

    const fromRoot = resolve(String(from));
    const freshHos = existsSync(join(fromRoot, ".hos")) ? join(fromRoot, ".hos") : fromRoot;
    if (!existsSync(join(freshHos, "tools", "hos.mjs"))) {
        return { ok: false, error: `no HOS release found at ${freshHos} (expected .hos/tools/hos.mjs)` };
    }

    const fromVersion = readVersionFrom(freshHos);
    const currentVersion = settings().hos?.version || null;
    const files = frameworkFiles(freshHos);
    const plan = classify(freshHos, files);
    const changed = plan.filter((p) => p.action !== "unchanged");
    const direction = fromVersion && currentVersion ? compareSemver(fromVersion, currentVersion) : 0;

    const result = {
        ok: true,
        from: freshHos.replaceAll("\\", "/"),
        fromVersion,
        currentVersion,
        downgrade: direction < 0,
        sameVersion: direction === 0 && Boolean(fromVersion),
        frameworkFiles: files.length,
        changes: { add: 0, update: 0, unchanged: 0 },
        plan: changed,
        applied: false,
        preserved: "tickets, memory, spec, bench, hos.json values, DESIGN.md, registry, reports, task"
    };
    for (const item of plan) {
        result.changes[item.action]++;
    }

    if (!apply) {
        result.next = changed.length ? "review the plan, then re-run with --apply" : "already current; nothing to apply";
        return result;
    }

    for (const item of changed) {
        const dest = join(HOS_DIR, item.file);
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(join(freshHos, item.file), dest);
    }
    if (fromVersion) {
        patchSettings({ hos: { version: fromVersion } });
    }
    // Derived indexes may change format between releases; regenerate them.
    memory.rebuildIndex();
    ledger.rebuildIndex();
    spec.rebuildIndex();

    result.applied = true;
    result.currentVersion = fromVersion || currentVersion;
    result.next = "re-run `node .hos/tools/hos.mjs doctor` (new tools load on the next invocation)";
    return result;
}
