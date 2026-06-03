// Local reference-scan impact analysis.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { REPO_ROOT } from "./paths.mjs";
import { toPosix } from "./util.mjs";

const SOURCE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".svelte", ".css", ".scss"]);
const SKIP = new Set(["node_modules", ".git", "dist", "build", "out", ".cache"]);

function sourceFiles(dir = REPO_ROOT, acc = [], allowHos = false) {
    for (const entry of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
        if ((entry.name.startsWith(".") && entry.name !== ".hos") || SKIP.has(entry.name) || (entry.name === ".hos" && !allowHos)) {
            continue;
        }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            sourceFiles(full, acc, allowHos);
        } else if (SOURCE_EXT.has(extname(entry.name))) {
            acc.push(full);
        }
    }
    return acc;
}

// Return files that reference `target` by path or symbol stem.
export function impact(target) {
    const targetRel = toPosix(relative(REPO_ROOT, existsSync(target) ? target : join(REPO_ROOT, target)));
    const allowHos = targetRel === ".hos" || targetRel.startsWith(".hos/");
    const stem = basename(target).replace(extname(target), "");
    const needle = new RegExp(`\\b${stem.replace(/[^a-zA-Z0-9_]/g, "")}\\b`);
    const referencedBy = [];

    for (const file of sourceFiles(REPO_ROOT, [], allowHos)) {
        if (relative(REPO_ROOT, file) === relative(REPO_ROOT, target)) {
            continue;
        }
        const text = readFileSync(file, "utf8");
        if (text.includes(target) || needle.test(text)) {
            referencedBy.push(toPosix(relative(REPO_ROOT, file)));
        }
    }

    return {
        target: targetRel,
        referencedBy,
        count: referencedBy.length,
        engine: "local-scan",
        note: "Local reference scan. Optional accelerators can add richer impact data."
    };
}
