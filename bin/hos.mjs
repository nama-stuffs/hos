#!/usr/bin/env node
// Human entry point for `npx @nama-stuffs/hos`. Dependency-free.
//
// Inside a project that already has .hos/, this delegates to the local
// .hos/tools/hos.mjs, so an installed `hos` on PATH runs the project's own
// harness. Otherwise `install` (or `init` / `adopt`) scaffolds .hos/ into the
// current directory from this package, then runs the requested setup.
//
// This launcher ships only in the npm package; it is never copied into a target
// project (the harness drop-in is .hos/ plus AGENTS.md). See bootstrap.md.

import { cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cwd = process.cwd();
const args = process.argv.slice(2);

function runLocal(toolArgs) {
    const result = spawnSync(process.execPath, [join(cwd, ".hos", "tools", "hos.mjs"), ...toolArgs], {
        cwd,
        stdio: "inherit"
    });
    process.exit(result.status ?? 1);
}

function scaffold() {
    if (!existsSync(join(cwd, ".hos"))) {
        cpSync(join(packageRoot, ".hos"), join(cwd, ".hos"), { recursive: true });
    }
    if (!existsSync(join(cwd, "AGENTS.md"))) {
        cpSync(join(packageRoot, "AGENTS.md"), join(cwd, "AGENTS.md"));
    }
}

// Installed project: hand every command to the local harness as-is.
if (existsSync(join(cwd, ".hos", "tools", "hos.mjs")) && args[0] !== "install") {
    runLocal(args);
}

// Fresh directory: scaffold from this package, then run the chosen setup.
const [command, ...rest] = args;
if (!command || command === "install" || command === "init" || command === "adopt") {
    scaffold();
    if (command === "adopt") {
        runLocal(["adopt", ...rest]);
    } else if (command === "init") {
        runLocal(["init", ...rest]);
    } else {
        runLocal(["status"]);
    }
} else {
    process.stdout.write(
        "hos: run inside a project that has .hos/, or scaffold here:\n"
        + "  npx @nama-stuffs/hos install              # drop in and report mode\n"
        + "  npx @nama-stuffs/hos init --name \"<name>\"  # new project\n"
        + "  npx @nama-stuffs/hos adopt --name \"<name>\" # existing project\n"
    );
    process.exit(1);
}
