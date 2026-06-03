import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function tempDir(name) {
    const dir = join(tmpdir(), `hos-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

function run(cwd, args) {
    return execFileSync(process.execPath, [join(cwd, ".hos", "tools", "hos.mjs"), ...args], {
        cwd,
        encoding: "utf8"
    }).trim();
}

function copySource(dest) {
    cpSync(repoRoot, dest, {
        recursive: true,
        filter: (src) => {
            const rel = relative(repoRoot, src).replaceAll("\\", "/");
            return rel === ""
                || rel === "AGENTS.md"
                || rel === ".hos"
                || (rel.startsWith(".hos/")
                    && !rel.startsWith(".hos/reports")
                    && (!rel.startsWith(".hos/task/") || rel === ".hos/task/README.md"));
        }
    });
}

test("init generates target-local support files and reaches run mode", () => {
    const dir = tempDir("init");
    try {
        copySource(dir);
        assert.equal(existsSync(join(dir, "DESIGN.md")), false);
        assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
        assert.equal(JSON.parse(run(dir, ["status"])).mode, "install");

        const initialized = JSON.parse(run(dir, ["init", "--name", "Smoke New", "--desc", "new project"]));
        assert.ok(initialized.generated.written.includes("CLAUDE.md"));
        assert.ok(initialized.generated.written.includes("DESIGN.md"));
        assert.equal(JSON.parse(run(dir, ["status"])).mode, "run");
        assert.equal(JSON.parse(run(dir, ["doctor"])).ok, true);

        const ticket = JSON.parse(run(dir, ["ticket", "create", "Plan proof", "--actor", "architect+backend"]));
        const plan = JSON.parse(readFileSync(join(ticket.dir, "plan.json"), "utf8"));
        assert.equal(plan.ticket, ticket.id);
        assert.equal(plan.lifecycle.execution, "architect+backend");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("adopt uses only .hos and AGENTS, detects package scripts, and leaves README alone", () => {
    const dir = tempDir("adopt");
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify({
            name: "host",
            scripts: { test: "node --test", lint: "eslint .", build: "tsc" }
        }, null, 2));
        cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
        cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));

        assert.equal(existsSync(join(dir, "README.md")), false);
        assert.equal(JSON.parse(run(dir, ["status"])).mode, "adopt");

        JSON.parse(run(dir, ["adopt", "--name", "Smoke Existing"]));
        const settings = JSON.parse(readFileSync(join(dir, ".hos", "hos.json"), "utf8"));

        assert.equal(JSON.parse(run(dir, ["status"])).mode, "run");
        assert.equal(settings.runtime.install, "npm install");
        assert.equal(settings.runtime.build, "npm run build");
        assert.equal(settings.checks.unit, "npm test");
        assert.equal(settings.checks.lint, "npm run lint");
        assert.equal(existsSync(join(dir, "README.md")), false);
        assert.equal(existsSync(join(dir, "DESIGN.md")), true);
        assert.equal(existsSync(join(dir, "CLAUDE.md")), true);
        assert.equal(JSON.parse(run(dir, ["doctor"])).ok, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("adopt preserves existing project docs, ignore rules, and harness memory", () => {
    const dir = tempDir("preserve");
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify({
            name: "host",
            scripts: { test: "node --test" }
        }, null, 2));
        writeFileSync(join(dir, "README.md"), "# Host Project\n");
        writeFileSync(join(dir, "DESIGN.md"), "# Existing Design\n");
        writeFileSync(join(dir, "CLAUDE.md"), "See AGENTS.md.\n");
        writeFileSync(join(dir, ".gitignore"), "dist/\n");
        cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
        cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));

        const localPolicy = join(dir, ".hos", "memory", "policy", "local-rule.md");
        writeFileSync(
            localPolicy,
            "---\ntitle: Local rule\nscope: local\nstatus: active\ntriggers: [local]\n---\n\nKeep me.\n"
        );

        JSON.parse(run(dir, ["adopt", "--name", "Preserve Existing"]));

        assert.equal(readFileSync(join(dir, "README.md"), "utf8"), "# Host Project\n");
        assert.equal(readFileSync(join(dir, "DESIGN.md"), "utf8"), "# Existing Design\n");
        assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf8"), "See AGENTS.md.\n");
        assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /dist\/[\s\S]*\.hos\/task\/\*/);
        assert.equal(existsSync(localPolicy), true);
        assert.equal(JSON.parse(run(dir, ["doctor"])).ok, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("accelerator registry is readable and empty accelerators do not block install", () => {
    const dir = tempDir("accelerators");
    try {
        copySource(dir);
        const listed = JSON.parse(run(dir, ["accelerators", "list"]));
        const plan = JSON.parse(run(dir, ["accelerators", "plan", "missing"]));

        assert.equal(listed.count, 0);
        assert.deepEqual(listed.accelerators, []);
        assert.equal(plan.ok, false);
        assert.deepEqual(plan.available, []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("contribute writes an opt-in bundle without upstream side effects", () => {
    const dir = tempDir("contribute");
    try {
        copySource(dir);
        const result = JSON.parse(run(dir, ["contribute", "--title", "Local proof"]));
        const manifest = JSON.parse(readFileSync(result.bundle.manifest, "utf8"));
        const prBody = readFileSync(result.bundle.prBody, "utf8");

        assert.equal(result.noDirectPr, true);
        assert.equal(manifest.noDirectPr, true);
        assert.equal(manifest.privacy.hostProjectFilesAllowed, false);
        assert.ok(manifest.scope.allowed.includes(".hos/"));
        assert.match(prBody, /Direct PR automation: disabled/);
        assert.equal(existsSync(result.bundle.manifest), true);
        assert.equal(existsSync(result.bundle.prBody), true);
        assert.equal(result.bundle.patch === null || existsSync(result.bundle.patch), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("ticket relations are recorded through the CLI", () => {
    const dir = tempDir("relations");
    try {
        copySource(dir);
        JSON.parse(run(dir, ["init", "--name", "Relations"]));
        const parent = JSON.parse(run(dir, ["ticket", "create", "Parent task"]));
        const child = JSON.parse(run(dir, ["ticket", "create", "Child task"]));
        const blocker = JSON.parse(run(dir, ["ticket", "create", "Blocker task"]));

        const linked = JSON.parse(run(dir, [
            "ticket", "link", child.id,
            "--parent", parent.id,
            "--blocked-by", blocker.id
        ]));

        assert.equal(linked.parent, parent.id);
        assert.deepEqual(linked.blockedBy, [blocker.id]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("adopt reads a BOM-prefixed package.json (Windows) instead of crashing", () => {
    const dir = tempDir("bom");
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        // A real-world Windows package.json can carry a UTF-8 BOM. The BOM is
        // stripped, so a valid manifest still detects its scripts normally.
        writeFileSync(join(dir, "package.json"), "\uFEFF" + JSON.stringify({
            name: "host",
            scripts: { test: "node --test" }
        }, null, 2));
        cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
        cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));

        const adopt = JSON.parse(run(dir, ["adopt", "--name", "Bom Host"]));
        const settings = JSON.parse(readFileSync(join(dir, ".hos", "hos.json"), "utf8"));
        assert.ok(adopt.generated.written.includes(".gitignore"), "scaffold still generated .gitignore");
        assert.equal(settings.checks.unit, "npm test", "BOM stripped, scripts detected");
        assert.equal(JSON.parse(run(dir, ["doctor"])).ok, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("adopt survives a malformed package.json by degrading to an interview", () => {
    const dir = tempDir("badpkg");
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(join(dir, "package.json"), "{ not valid json ");
        cpSync(join(repoRoot, ".hos"), join(dir, ".hos"), { recursive: true });
        cpSync(join(repoRoot, "AGENTS.md"), join(dir, "AGENTS.md"));

        const adopt = JSON.parse(run(dir, ["adopt", "--name", "Bad Host"]));
        assert.ok(adopt.detected.some((s) => /interview/.test(s)), "malformed package.json yields an interview signal");
        assert.ok(adopt.generated.written.includes(".gitignore"), "scaffold still completed");
        assert.equal(JSON.parse(run(dir, ["doctor"])).ok, true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
