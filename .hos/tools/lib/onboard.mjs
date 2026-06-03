// Detects how Inter should onboard on first run: a brand-new project, an existing
// codebase the harness was dropped into, or an already-set-up harness. Inter uses
// this to decide whether to interview-and-install, adopt, or just start working.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.mjs";
import { isInitialized, settings } from "./config.mjs";
import { isSourceRepo } from "./install-files.mjs";

// Signals that a real project already surrounds the harness.
const PROJECT_SIGNALS = [
    "package.json", "bun.lockb", "tsconfig.json", "src", "go.mod",
    "Cargo.toml", "pyproject.toml", "requirements.txt", "pom.xml", "Gemfile"
];

function detectExistingProject() {
    const entries = new Set(existsSync(REPO_ROOT) ? readdirSync(REPO_ROOT) : []);
    const hits = PROJECT_SIGNALS.filter((s) => entries.has(s));
    // A lone AGENTS.md/.hos/README/.git does not count as a "project".
    return hits;
}

export function onboarding() {
    if (isInitialized()) {
        return { mode: "run", reason: `project "${settings().project.name}" is set up` };
    }

    // Developing HOS itself: this is the source repo, not a target. init/adopt are
    // refused here (see install-files.isSourceRepo), so report it honestly instead
    // of pretending a fresh project needs scaffolding.
    if (isSourceRepo()) {
        return { mode: "source", reason: "HOS source repo; develop the harness here. init/adopt are disabled (use --force only to test scaffolding)" };
    }

    const hits = detectExistingProject();
    if (hits.length) {
        return {
            mode: "adopt",
            reason: "existing project detected; bind the harness to it and seed specs/DESIGN from the real code",
            signals: hits
        };
    }

    return { mode: "install", reason: "empty/new project; interview the user and scaffold from scratch" };
}
