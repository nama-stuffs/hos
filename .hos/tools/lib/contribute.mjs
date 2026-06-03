// Builds a local, reviewable contribution bundle. This command never branches,
// pushes, or opens an upstream pull request.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compare, hasImprovement, hasRegression } from "./bench.mjs";
import { HOS_VERSION } from "./meta.mjs";
import { isSourceRepo } from "./install-files.mjs";
import { REPORTS_DIR, REPO_ROOT } from "./paths.mjs";
import { smoke } from "./smoke.mjs";
import { nowIso, slugify } from "./util.mjs";

const UPSTREAM = "https://github.com/nama-stuffs/hos";

function contributionScope() {
    return isSourceRepo()
        ? [".hos", "AGENTS.md", "README.md", ".github", ".gitignore"]
        : [".hos", "AGENTS.md"];
}

function displayScope(scope) {
    return scope.map((item) => [".hos", ".github"].includes(item) ? `${item}/` : item);
}

function gitOutput(args) {
    return execFileSync("git", args, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
    }).trimEnd();
}

function parseStatusLine(line) {
    const path = line.slice(3).trim();
    return (path.includes(" -> ") ? path.split(" -> ").pop() : path).replaceAll("\\", "/");
}

function detectChangedFiles(scope) {
    try {
        if (gitOutput(["rev-parse", "--is-inside-work-tree"]) !== "true") {
            throw new Error("not a work tree");
        }
        const status = gitOutput(["status", "--porcelain", "--", ...scope]);
        const files = status.split("\n").map((line) => line.trimEnd()).filter(Boolean).map(parseStatusLine);
        let patch = "";
        try {
            patch = gitOutput(["diff", "--binary", "HEAD", "--", ...scope]);
        } catch {
            patch = gitOutput(["diff", "--binary", "--", ...scope]);
        }

        return {
            detected: true,
            method: "git status --porcelain",
            files,
            patch: patch.trim() ? patch + "\n" : "",
            patchAvailable: Boolean(patch.trim())
        };
    } catch {
        return {
            detected: false,
            method: "manual",
            files: [],
            patch: "",
            patchAvailable: false,
            reason: "change detection unavailable in this workspace"
        };
    }
}

function metricLine(name, metric) {
    return metric
        ? `- ${name}: ${metric.from} -> ${metric.to} (${metric.verdict})`
        : `- ${name}: unavailable`;
}

function renderPrBody(manifest) {
    const benchmark = manifest.proof.benchmark;
    const files = manifest.scope.changedFiles.files.length
        ? manifest.scope.changedFiles.files.map((file) => `- ${file}`).join("\n")
        : "- Not detected. Review the declared scope manually.";

    const benchmarkLines = benchmark.error
        ? [`- Benchmark: ${benchmark.error}`]
        : [
            metricLine("Scenarios", benchmark.scenarios),
            metricLine("Policy recall", benchmark.policyRecall),
            metricLine("Clarifying questions", benchmark.clarifyingQuestions),
            metricLine("Spec capabilities", benchmark.specCapabilities),
            metricLine("Doc health", benchmark.docHealthy)
        ];

    return `# ${manifest.title}

## Proof

- Smoke: ${manifest.proof.smoke.summary}
${benchmarkLines.join("\n")}

## Scope

${files}

Allowed scope:
${manifest.scope.allowed.map((item) => `- ${item}`).join("\n")}

## Safety

- Direct PR automation: disabled.
- User approval required before any upstream workspace action.
- Host project files, secrets, logs, screenshots, and ticket evidence are out of scope.

## Upstream Verification

\`\`\`bash
node .hos/tools/hos.mjs doctor
node .hos/tools/hos.mjs test
node .hos/tools/hos.mjs smoke
node .hos/tools/hos.mjs bench --compare
\`\`\`
`;
}

function writeBundle(manifest, patch) {
    const dir = join(REPORTS_DIR, "contributions", manifest.id);
    const manifestPath = join(dir, "manifest.json");
    const prBodyPath = join(dir, "PR_BODY.md");
    const patchPath = patch ? join(dir, "patch.diff") : "";

    mkdirSync(dir, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(prBodyPath, renderPrBody(manifest));
    if (patch) {
        writeFileSync(patchPath, patch);
    }

    return {
        id: manifest.id,
        dir,
        manifest: manifestPath,
        prBody: prBodyPath,
        patch: patchPath || null
    };
}

export function contribute({ title }) {
    const createdAt = nowIso();
    const name = title?.trim() || "HOS improvement";
    const slug = slugify(name) || "hos-improvement";
    const id = `${createdAt.replace(/\D/g, "").slice(0, 14)}-${slug}`;
    const scope = contributionScope();
    const changedFiles = detectChangedFiles(scope);
    const benchmark = compare();
    const smokeProof = smoke();
    const eligible = smokeProof.ok && !hasRegression(benchmark) && hasImprovement(benchmark);
    const branch = `hos-contrib/${id}`;
    const manifest = {
        schema: "hos.contribution.v1",
        id,
        title: name,
        createdAt,
        hosVersion: HOS_VERSION,
        upstream: UPSTREAM,
        branch,
        eligible,
        noDirectPr: true,
        scope: {
            sourceRepoMode: isSourceRepo(),
            allowed: displayScope(scope),
            changedFiles: {
                detected: changedFiles.detected,
                method: changedFiles.method,
                files: changedFiles.files,
                patchAvailable: changedFiles.patchAvailable,
                reason: changedFiles.reason || ""
            }
        },
        privacy: {
            reviewRequired: true,
            hostProjectFilesAllowed: false,
            forbidden: ["secrets", "host source", "logs", "screenshots", "ticket evidence"]
        },
        proof: {
            smoke: smokeProof,
            benchmark
        },
        upstreamWorkflow: [
            "User approves upstream proposal.",
            "Apply the bundle in a clean upstream workspace.",
            "Run doctor, test, smoke, and bench compare.",
            "Open a draft PR with PR_BODY.md only after local proof passes."
        ]
    };
    const bundle = writeBundle(manifest, changedFiles.patch);

    return {
        title: name,
        eligible,
        noDirectPr: true,
        upstream: UPSTREAM,
        branch,
        bundle,
        changedFiles: manifest.scope.changedFiles,
        proof: {
            smoke: smokeProof,
            benchmark
        },
        nextSteps: eligible
            ? [
                "Review the bundle manifest and PR_BODY.md.",
                "Ask the user before creating or using an upstream workspace.",
                "Apply only the declared HOS scope or patch.diff in a clean upstream workspace.",
                "Run doctor, test, smoke, and bench compare before opening a draft PR."
            ]
            : [
                "Bundle written for inspection only.",
                "Do not propose upstream until smoke passes and benchmark has no regression.",
                "Improve a metric or add a scenario that guards a real observed failure, then re-run contribute."
            ]
    };
}
