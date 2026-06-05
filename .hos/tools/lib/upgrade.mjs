// hos upgrade: re-sync framework-owned files from a newer HOS release while
// preserving project-owned paths AND the project's own framework modifications.
// A three-way merge against the pristine baseline classifies each file; safe
// changes apply, local modifications are kept, and genuine conflicts are surfaced
// for the agent to resolve - never silently overwritten. A pre-update snapshot
// makes the whole step reversible. See doc/protocol/upgrade.md.

import https from "node:https";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HOS_DIR } from "./paths.mjs";
import { settings, patchSettings } from "./config.mjs";
import { isSourceRepo } from "./install-files.mjs";
import { frameworkFiles, normEol } from "./framework.mjs";
import { sha256 } from "./util.mjs";
import * as baseline from "./baseline.mjs";
import * as memory from "./memory.mjs";
import * as ledger from "./ledger.mjs";
import * as spec from "./spec.mjs";

const DEFAULT_REMOTE = "https://raw.githubusercontent.com/nama-stuffs/hos/main/.hos/tools/lib/meta.mjs";

// Actions whose new-release content is written on --apply. keep-local and conflict
// are left untouched; conflict is surfaced for the agent.
const APPLY = new Set(["add", "overwrite", "review"]);

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

// Three-way compare per file: live target vs new release vs the pristine base
// (last synced). Without a base, a differing file is "review" - the agent decides -
// but it is still applied (and snapshotted) so a first upgrade is not a no-op.
function classify(freshHos, files) {
    return files.map((file) => {
        const target = join(HOS_DIR, file);
        const newText = normEol(readFileSync(join(freshHos, file), "utf8"));
        if (!existsSync(target)) {
            return { file, action: "add" };
        }
        const targetText = normEol(readFileSync(target, "utf8"));
        if (newText === targetText) {
            return { file, action: "unchanged" };
        }
        const base = baseline.baseHash("synced", file);
        if (base === null) {
            return { file, action: "review" };
        }
        if (sha256(targetText) === base) {
            return { file, action: "overwrite" };
        }
        if (sha256(newText) === base) {
            return { file, action: "keep-local" };
        }
        return { file, action: "conflict" };
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
    const conflicts = plan.filter((p) => p.action === "conflict").map((p) => p.file);
    const keptLocal = plan.filter((p) => p.action === "keep-local").map((p) => p.file);
    const intents = memory.byKind("harness-change").map((m) => ({ id: m.id, title: m.title, body: m.body }));
    const direction = fromVersion && currentVersion ? compareSemver(fromVersion, currentVersion) : 0;

    const result = {
        ok: true,
        from: freshHos.replaceAll("\\", "/"),
        fromVersion, currentVersion,
        downgrade: direction < 0,
        sameVersion: direction === 0 && Boolean(fromVersion),
        frameworkFiles: files.length,
        changes: { add: 0, overwrite: 0, "keep-local": 0, conflict: 0, review: 0, unchanged: 0 },
        plan: changed,
        conflicts, keptLocal,
        harnessChangeIntents: intents,
        applied: false,
        preserved: "tickets, memory, spec, bench, audit ledger, hos.json values, DESIGN.md, registry, reports, plus your own framework modifications"
    };
    for (const item of plan) {
        result.changes[item.action] = (result.changes[item.action] || 0) + 1;
    }

    if (!apply) {
        result.next = conflicts.length
            ? `resolve ${conflicts.length} conflict(s) with the agent (see harnessChangeIntents), then re-run --apply`
            : (changed.length ? "review the plan, then re-run with --apply" : "already current; nothing to apply");
        return result;
    }

    // Reversible: snapshot the current framework state before touching anything.
    result.snapshot = baseline.snapshot(`pre-${Date.now()}`).label;
    baseline.prune(3);

    for (const item of plan) {
        if (APPLY.has(item.action)) {
            const dest = join(HOS_DIR, item.file);
            mkdirSync(dirname(dest), { recursive: true });
            cpSync(join(freshHos, item.file), dest);
        }
    }

    // Derived indexes may change format between releases; regenerate them.
    memory.rebuildIndex();
    ledger.rebuildIndex();
    spec.rebuildIndex();

    result.applied = true;
    if (conflicts.length === 0) {
        // Clean apply: advance to the new release - bump version and refresh the base.
        if (fromVersion) {
            patchSettings({ hos: { version: fromVersion } });
        }
        baseline.snapshot("synced", freshHos);
        result.currentVersion = fromVersion || currentVersion;
        result.next = "re-run `node .hos/tools/hos.mjs doctor` (new tools load on the next invocation)";
    } else {
        result.next = `${conflicts.length} conflict(s) remain - resolve them (see harnessChangeIntents and keptLocal), then re-run --apply. Version not bumped, base not advanced.`;
    }
    return result;
}

function fetchText(url, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                resolve(null);
                return;
            }
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => resolve(data));
        });
        req.on("error", () => resolve(null));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(null);
        });
    });
}

// Check a remote release for a newer version. Network only when invoked, and
// offline-safe: an unreachable remote returns reachable:false, never throws. The
// remote may be an http(s) URL or a local file path (used in tests).
export async function checkUpdate({ remote = null } = {}) {
    const url = remote || settings().upgrade?.remote || DEFAULT_REMOTE;
    const current = settings().hos?.version || null;
    let text = null;
    if (/^https?:/i.test(url)) {
        text = await fetchText(url);
    } else if (existsSync(url)) {
        text = readFileSync(url, "utf8");
    }
    if (text === null) {
        return { ok: true, reachable: false, current, remote: null, newer: false, url, note: `could not reach ${url}` };
    }
    const match = /HOS_VERSION\s*=\s*["']([^"']+)["']|"version"\s*:\s*"([^"]+)"/.exec(text);
    const remoteVersion = match ? (match[1] || match[2]) : null;
    return {
        ok: true,
        reachable: true,
        current,
        remote: remoteVersion,
        newer: Boolean(remoteVersion && current && compareSemver(remoteVersion, current) > 0),
        policy: settings().upgrade?.policy || "manual",
        url
    };
}

// Roll back to a pre-update snapshot (default: the most recent), reconstructing the
// pre-update framework state even with no git.
export function restoreBaseline(label = null) {
    const target = label || baseline.latestPre();
    if (!target) {
        return { ok: false, error: "no baseline snapshot to restore (none captured yet)" };
    }
    const r = baseline.restore(target);
    memory.rebuildIndex();
    ledger.rebuildIndex();
    spec.rebuildIndex();
    return { ...r, next: "re-run `node .hos/tools/hos.mjs doctor`" };
}
