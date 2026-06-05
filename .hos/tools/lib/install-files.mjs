// Generates target-local support files during init/adopt.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOS_DIR, REPO_ROOT } from "./paths.mjs";

const DESIGN_MD = join(REPO_ROOT, "DESIGN.md");
const CLAUDE_MD = join(REPO_ROOT, "CLAUDE.md");
const BOOTSTRAP_MD = join(HOS_DIR, "bootstrap.md");
const GITIGNORE = join(REPO_ROOT, ".gitignore");
const README_MD = join(REPO_ROOT, "README.md");

const HOS_GITIGNORE_BLOCK = `# HOS local artifacts
.hos/.cache/
.hos/.baseline/
.hos/msg/
.hos/reports/
.hos/tickets/*/evidence/
.hos/tickets/*/claim.json
.hos/tickets/*/log/
`;

const FOREIGN_STACKS = [
    ["pyproject.toml", "python"], ["requirements.txt", "python"],
    ["go.mod", "go"], ["Cargo.toml", "rust"], ["pom.xml", "java"],
    ["build.gradle", "java"], ["Gemfile", "ruby"], ["composer.json", "php"]
];

function title(name) {
    return name?.trim() || "Project";
}

export function isSourceRepo() {
    return existsSync(README_MD)
        && /Harness Operating System/i.test(readFileSync(README_MD, "utf8").split("\n", 1)[0]);
}

function designTemplate({ projectName, description, adopted }) {
    const intro = adopted
        ? "Generated during HOS adoption. Replace starter tokens as agents touch UI areas."
        : "Generated during HOS install. Replace starter tokens during onboarding.";

    return `---
version: alpha
name: ${title(projectName)}
description: ${description || "Generated design system starter."}
colors:
  primary: "#2563EB"
  on-primary: "#FFFFFF"
  secondary: "#64748B"
  neutral: "#F8FAFC"
  foreground: "#0F172A"
  destructive: "#B91C1C"
typography:
  h1:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.2
  h2:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
---

# Design System

${intro}

## Overview

Describe the audience, visual personality, and product UI direction.

## Colors

Use semantic tokens. Add tokens only with a named role and AA contrast in the
intended use.

## Typography

Keep the type scale short and consistent.

## Components

Define reusable components before implementation depends on them. Interactive
components need default, hover, active, focus-visible, disabled, and loading
states.

## Validation

Validate visual changes against this file and .hos/doc/audit/design.md.
`;
}

function foreignStackSignals() {
    return FOREIGN_STACKS.filter(([file]) => existsSync(join(REPO_ROOT, file))).map(([, name]) => name);
}

function readPackageJson(pkgPath) {
    try {
        return JSON.parse(readFileSync(pkgPath, "utf8").replace(/^\uFEFF/, ""));
    } catch {
        return null;
    }
}

export function detectProjectCommands() {
    const pkgPath = join(REPO_ROOT, "package.json");
    if (!existsSync(pkgPath)) {
        const stacks = [...new Set(foreignStackSignals())];
        return stacks.length
            ? { settings: {}, signals: [...stacks, "commands unknown - interview for runtime/checks"] }
            : { settings: {}, signals: [] };
    }

    const pkg = readPackageJson(pkgPath);
    if (!pkg) {
        return { settings: {}, signals: ["package.json unreadable - interview for runtime/checks"] };
    }

    const scripts = pkg.scripts || {};
    const runner = existsSync(join(REPO_ROOT, "bun.lockb")) || existsSync(join(REPO_ROOT, "bun.lock")) ? "bun" : "npm";
    const run = (name) => runner === "bun" ? `bun run ${name}` : (name === "test" ? "npm test" : `npm run ${name}`);
    const has = (name) => Object.prototype.hasOwnProperty.call(scripts, name);

    return {
        settings: {
            runtime: {
                install: runner === "bun" ? "bun install" : "npm install",
                dev: has("dev") ? run("dev") : "",
                build: has("build") ? run("build") : ""
            },
            checks: {
                typecheck: has("typecheck") ? run("typecheck") : "",
                lint: has("lint") ? run("lint") : "",
                unit: has("test") ? run("test") : (has("unit") ? run("unit") : ""),
                e2e: has("e2e") ? run("e2e") : (has("test:e2e") ? run("test:e2e") : "")
            }
        },
        signals: ["package.json", `${runner} scripts`]
    };
}

export function ensureGeneratedFiles({ projectName = "", description = "", adopted = false } = {}) {
    const written = [];
    const kept = [];

    if (existsSync(DESIGN_MD)) {
        kept.push("DESIGN.md");
    } else {
        writeFileSync(DESIGN_MD, designTemplate({ projectName, description, adopted }));
        written.push("DESIGN.md");
    }

    if (existsSync(CLAUDE_MD)) {
        kept.push("CLAUDE.md");
    } else {
        writeFileSync(
            CLAUDE_MD,
            "See [AGENTS.md](AGENTS.md). Generated for tools that look for `CLAUDE.md`; AGENTS.md is the source of truth.\n"
        );
        written.push("CLAUDE.md");
    }

    if (existsSync(GITIGNORE)) {
        const current = readFileSync(GITIGNORE, "utf8");
        if (current.includes(".hos/.cache/") && current.includes(".hos/reports/")) {
            kept.push(".gitignore");
        } else {
            writeFileSync(GITIGNORE, `${current.trimEnd()}\n\n${HOS_GITIGNORE_BLOCK}`);
            written.push(".gitignore");
        }
    } else {
        writeFileSync(GITIGNORE, HOS_GITIGNORE_BLOCK);
        written.push(".gitignore");
    }

    return { written, kept };
}

export function bootstrapPresent() {
    return existsSync(BOOTSTRAP_MD);
}
