// Audit ledger: production files stay audited. A file in scope is born audited
// (it gets a ledger entry when created) and must be re-audited when its content
// changes. `check` is the gate rev runs before acceptance; drift or an unaudited
// in-scope file fails it. Tests, specs, and build tooling are never in scope.
// See doc/protocol/audit.md.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { HOS_DIR, REPO_ROOT } from "./paths.mjs";
import { settings } from "./config.mjs";
import { globMatch, sha256, today, toPosix } from "./util.mjs";

const AUDIT_DIR = join(HOS_DIR, "audit");
const LEDGER = join(AUDIT_DIR, "ledger.json");

// Not production-facing, so out of scope regardless of project config: tests,
// fixtures, build/tooling config, dependencies, VCS, and the harness itself.
const DEFAULT_EXCLUDES = [
    "**/*.test.*", "**/*.spec.*", "**/test/**", "**/tests/**", "**/__tests__/**",
    "**/__mocks__/**", "**/fixtures/**", "**/*.config.*"
];

// Heavy or irrelevant directories never descended during the scan.
const SKIP_DIRS = new Set([".git", "node_modules", ".hos", "dist", "build", "coverage", "vendor", ".cache", ".next", "out"]);

function scope() {
    const a = settings().audit || {};
    return { include: a.include || [], exclude: [...DEFAULT_EXCLUDES, ...(a.exclude || [])] };
}

function loadLedger() {
    return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { files: {} };
}

function saveLedger(data) {
    mkdirSync(AUDIT_DIR, { recursive: true });
    writeFileSync(LEDGER, JSON.stringify(data, null, 2) + "\n");
}

// A repo-relative posix path is in scope when an include pattern matches and no
// exclude (default or configured) does.
function inScope(rel, { include, exclude }) {
    return !exclude.some((p) => globMatch(rel, p)) && include.some((p) => globMatch(rel, p));
}

// Every file under the repo root as a posix path, pruning skip dirs so a big
// node_modules is never walked.
function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
                walk(join(dir, entry.name), out);
            }
        } else {
            out.push(toPosix(relative(REPO_ROOT, join(dir, entry.name))));
        }
    }
    return out;
}

const normPath = (path) => toPosix(path).replace(/^\.\//, "");

// Mark a file audited: record its current content hash and provenance.
export function record(path, { by = "", ticket = "", note = "" } = {}) {
    const rel = normPath(path);
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) {
        throw new Error(`no such file: ${rel}`);
    }
    const ledger = loadLedger();
    ledger.files = ledger.files || {};
    ledger.files[rel] = { hash: sha256(readFileSync(abs, "utf8")), by, ticket, date: today(), note };
    saveLedger(ledger);
    return { ok: true, path: rel, ...ledger.files[rel] };
}

// The ledger, or one file's entry.
export function status(path) {
    const ledger = loadLedger();
    if (path) {
        const rel = normPath(path);
        return { path: rel, entry: ledger.files?.[rel] || null };
    }
    return { files: ledger.files || {}, count: Object.keys(ledger.files || {}).length };
}

// The gate. Classifies in-scope files into unaudited (no entry), drifted (content
// changed since audit), and orphan (a ledger entry whose file is gone or now out
// of scope). ok when nothing is unaudited or drifted. With no include scope it is
// an advisory no-op, so generic installs are unaffected.
export function check() {
    const { include, exclude } = scope();
    const tracked = loadLedger().files || {};
    if (!include.length) {
        return { ok: true, scopeConfigured: false, note: "no audit scope configured (hos.json audit.include)", unaudited: [], drifted: [], orphans: [] };
    }
    const present = walk(REPO_ROOT).filter((rel) => inScope(rel, { include, exclude }));
    const unaudited = [];
    const drifted = [];
    for (const rel of present) {
        const entry = tracked[rel];
        if (!entry) {
            unaudited.push(rel);
        } else if (sha256(readFileSync(join(REPO_ROOT, rel), "utf8")) !== entry.hash) {
            drifted.push(rel);
        }
    }
    const presentSet = new Set(present);
    const orphans = Object.keys(tracked).filter((rel) => !presentSet.has(rel));
    return { ok: unaudited.length === 0 && drifted.length === 0, scopeConfigured: true, unaudited, drifted, orphans };
}

// Drop ledger entries for files no longer in scope (curator hygiene).
export function prune() {
    const { include, exclude } = scope();
    const ledger = loadLedger();
    const present = new Set(walk(REPO_ROOT).filter((rel) => inScope(rel, { include, exclude })));
    const removed = Object.keys(ledger.files || {}).filter((rel) => !present.has(rel));
    for (const rel of removed) {
        delete ledger.files[rel];
    }
    saveLedger(ledger);
    return { ok: true, removed };
}
