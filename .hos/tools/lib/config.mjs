// Loads .hos/hos.json, the single project settings file.

import { readFileSync, writeFileSync } from "node:fs";
import { HOS_JSON } from "./paths.mjs";

let cached = null;

export function settings() {
    return (cached ??= JSON.parse(readFileSync(HOS_JSON, "utf8")));
}

function mergeValue(current, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return patch;
    }
    const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
    return Object.fromEntries(
        Object.entries({ ...base, ...patch }).map(([key, value]) => [
            key,
            Object.prototype.hasOwnProperty.call(patch, key) ? mergeValue(base[key], value) : value
        ])
    );
}

// Persist a recursive patch back to hos.json (used by install/adopt).
export function patchSettings(patch) {
    const next = mergeValue(settings(), patch);
    writeFileSync(HOS_JSON, JSON.stringify(next, null, 2) + "\n");
    cached = next;
    return next;
}

// Has the harness been set up for this project yet? It is initialized once a
// project name is set (install for a new project, or adopt for an existing one).
export function isInitialized() {
    const name = settings().project?.name;
    return Boolean(name && name.trim());
}
