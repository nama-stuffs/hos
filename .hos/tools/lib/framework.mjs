// Which files the framework owns - shared by `hos upgrade` (what to re-sync) and
// baseline snapshots (what to capture). Everything else under .hos/ is
// project-owned and an upgrade never touches it.

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// Whole directories the framework owns, plus individual framework files that live
// beside project state.
export const FRAMEWORK_DIRS = ["persona", "doc/protocol", "doc/audit", "task", "tools"];
export const FRAMEWORK_FILES = [
    "agents.template.md",
    "doc/accelerators.md",
    "bootstrap.md",
    "install.md",
    "memory/README.md",
    "tickets/README.md",
    "doc/spec/README.md"
];

export const normEol = (text) => text.replace(/\r\n/g, "\n");

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

// Every framework file a given root ships, as forward-slash paths relative to it.
export function frameworkFiles(root) {
    const files = [];
    for (const dir of FRAMEWORK_DIRS) {
        walk(join(root, dir), root, files);
    }
    for (const file of FRAMEWORK_FILES) {
        if (existsSync(join(root, file))) {
            files.push(file);
        }
    }
    return [...new Set(files)].sort();
}
