// Language settings. Harness-internal text (docs, protocols, personas, records)
// stays in one consistent language - `harness`, English by default. Inter and
// user-facing reports use `user` (auto = match the user's language, or a fixed
// code). Both are config so a fully translated harness can be produced and
// benchmarked. See doc/protocol/language.md.

import { settings, patchSettings } from "./config.mjs";

export function status() {
    const l = settings().language || {};
    return { harness: l.harness || "en", user: l.user || "auto" };
}

// Persist a language choice - what Inter records when it detects or is told the
// user's language, or to flip the harness language for a translation experiment.
export function set({ harness = "", user = "" } = {}) {
    const patch = {};
    if (harness) {
        patch.harness = harness;
    }
    if (user) {
        patch.user = user;
    }
    patchSettings({ language: patch });
    return { ok: true, ...status() };
}
