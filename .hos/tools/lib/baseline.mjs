// Pre-update snapshots under a gitignored .hos/.baseline/. Before an upgrade
// applies, the current framework files are copied to .baseline/pre-<ts>/ so the
// exact pre-update state can be restored even with no git or uncommitted changes.
// A pristine "synced" snapshot (captured at install and after each clean upgrade)
// is the merge base: diffing the live files against it reveals the project's own
// modifications, so an upgrade never silently overwrites them. See
// doc/protocol/upgrade.md.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOS_DIR } from "./paths.mjs";
import { frameworkFiles, normEol } from "./framework.mjs";
import { sha256 } from "./util.mjs";

const BASELINE_DIR = join(HOS_DIR, ".baseline");
const snapDir = (label) => join(BASELINE_DIR, label);

// Copy the framework files of `srcRoot` (default: the live .hos/) into a snapshot.
export function snapshot(label, srcRoot = HOS_DIR) {
    const dir = snapDir(label);
    rmSync(dir, { recursive: true, force: true });
    let files = 0;
    for (const rel of frameworkFiles(srcRoot)) {
        const src = join(srcRoot, rel);
        if (existsSync(src)) {
            const dest = join(dir, rel);
            mkdirSync(dirname(dest), { recursive: true });
            cpSync(src, dest);
            files++;
        }
    }
    return { ok: true, label, files, dir: dir.replaceAll("\\", "/") };
}

// Restore framework files from a snapshot back over the live .hos/.
export function restore(label) {
    const dir = snapDir(label);
    if (!existsSync(dir)) {
        throw new Error(`no baseline snapshot: ${label} (have: ${list().join(", ") || "none"})`);
    }
    let restored = 0;
    for (const rel of frameworkFiles(dir)) {
        const dest = join(HOS_DIR, rel);
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(join(dir, rel), dest);
        restored++;
    }
    return { ok: true, label, restored };
}

export function list() {
    return existsSync(BASELINE_DIR)
        ? readdirSync(BASELINE_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
        : [];
}

// The newest pre-* snapshot label, or null - the default recovery point.
export function latestPre() {
    const pres = list().filter((l) => l.startsWith("pre-"));
    return pres.length ? pres[pres.length - 1] : null;
}

const hashOf = (file) => existsSync(file) ? sha256(normEol(readFileSync(file, "utf8"))) : null;

// A framework file's hash in a snapshot (the merge base), or null when absent.
export function baseHash(label, rel) {
    return hashOf(join(snapDir(label), rel));
}

// The project's own modifications to framework files since the last sync, by
// comparing the live files to the pristine base snapshot.
export function localChanges(base = "synced") {
    const dir = snapDir(base);
    if (!existsSync(dir)) {
        return { hasBase: false, modified: [], added: [] };
    }
    const baseFiles = new Set(frameworkFiles(dir));
    const modified = [];
    const added = [];
    for (const rel of frameworkFiles(HOS_DIR)) {
        if (!baseFiles.has(rel)) {
            added.push(rel);
        } else if (hashOf(join(HOS_DIR, rel)) !== hashOf(join(dir, rel))) {
            modified.push(rel);
        }
    }
    return { hasBase: true, modified, added };
}

// Keep the newest `keep` pre-* snapshots (plus synced); drop older recovery points.
export function prune(keep = 3) {
    const pres = list().filter((l) => l.startsWith("pre-"));
    const drop = pres.slice(0, Math.max(0, pres.length - keep));
    for (const label of drop) {
        rmSync(snapDir(label), { recursive: true, force: true });
    }
    return { ok: true, dropped: drop };
}
