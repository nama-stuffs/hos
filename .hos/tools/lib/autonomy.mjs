// Autonomy gate: which change levels may proceed without asking the user.
//
// A change is classified by the level it genuinely requires - low (L1: no
// behavior change), medium (L2: a concrete behavior change), or high (L3: a
// refactor whose parity is not trivially provable). The granted autonomy is the
// highest level that may proceed without a fresh user grant. When the required
// level exceeds the grant, the work escalates through Inter for permission; it is
// never silently down-classified to slip under the gate. See
// doc/protocol/task.md.

import { settings, patchSettings } from "./config.mjs";

// Ordered so a numeric compare answers "does required fit under granted?".
export const LEVELS = { low: 1, medium: 2, high: 3 };
export const LEVEL_NAMES = Object.keys(LEVELS);

export function normalizeLevel(level) {
    const value = String(level || "").toLowerCase();
    if (!LEVELS[value]) {
        throw new Error(`unknown level: ${level} (one of: ${LEVEL_NAMES.join(", ")})`);
    }
    return value;
}

// The effective grant: an explicit session grant overrides the configured
// default; absent both, medium.
export function granted() {
    const a = settings().autonomy || {};
    return normalizeLevel(a.granted || a.default || "medium");
}

// Persist a session/standing grant - what Inter records when the user raises it.
export function setGranted(level) {
    const value = normalizeLevel(level);
    patchSettings({ autonomy: { granted: value } });
    return { ok: true, granted: value };
}

// Decide whether work at `required` may proceed under the current grant.
export function gate(required) {
    const req = normalizeLevel(required);
    const g = granted();
    return { ok: LEVELS[req] <= LEVELS[g], required: req, granted: g, escalate: LEVELS[req] > LEVELS[g] };
}

// The current grant and configured default, for `hos autonomy show`.
export function status() {
    const a = settings().autonomy || {};
    return { granted: granted(), default: normalizeLevel(a.default || "medium"), levels: LEVEL_NAMES };
}
