// Effectiveness benchmark. See .hos/doc/protocol/bench.md.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOS_DIR } from "./paths.mjs";
import { search, renderPolicyBlock } from "./memory.mjs";
import { list as listSpecs } from "./spec.mjs";
import { doctor } from "./doctor.mjs";
import { today } from "./util.mjs";

const BENCH_DIR = join(HOS_DIR, "doc", "bench");
const BASELINE = join(BENCH_DIR, "baseline.json");

// Scenario fixtures are .md files with `prompt` and expected policy ids.
function loadScenarios() {
    const dir = join(BENCH_DIR, "scenarios");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => parseScenario(join(dir, f), f))
        : [];
}

function parseScenario(path, name) {
    const text = readFileSync(path, "utf8");
    const prompt = /prompt:\s*(.+)/.exec(text)?.[1]?.trim() || "";
    const list = (key) => {
        const line = new RegExp(`${key}:\\s*\\[(.*)\\]`).exec(text)?.[1] || "";
        return line.split(",").map((s) => s.trim()).filter(Boolean);
    };
    // `expect`: policies that must surface. `reject`: policies that must NOT
    // surface for this prompt (guards against over-broad triggers).
    return { name: name.replace(/\.md$/, ""), prompt, expect: list("expect"), reject: list("reject") };
}

// Recall metric: of the policies a scenario expects, how many does memory surface?
function scoreRecall(scenarios) {
    let expected = 0;
    let recalled = 0;
    const misses = [];

    for (const s of scenarios) {
        const hits = search(s.prompt).map((p) => p.id);
        for (const want of s.expect) {
            expected++;
            if (hits.some((id) => id.includes(want))) {
                recalled++;
            } else {
                misses.push(`${s.name} -> ${want}`);
            }
        }
    }

    return { expected, recalled, rate: expected ? +(recalled / expected).toFixed(3) : 1, misses };
}

// Precision metric: of the policies a scenario explicitly forbids, how many leak
// into the result anyway? A high count means triggers are too broad and pollute
// unrelated prompts. Lower falseSurfaces is better.
function scorePrecision(scenarios) {
    let checks = 0;
    let falseSurfaces = 0;
    const violations = [];

    for (const s of scenarios) {
        const hits = search(s.prompt).map((p) => p.id);
        for (const bad of s.reject || []) {
            checks++;
            if (hits.some((id) => id.includes(bad))) {
                falseSurfaces++;
                violations.push(`${s.name} -> ${bad}`);
            }
        }
    }

    return { checks, falseSurfaces, rate: checks ? +(1 - falseSurfaces / checks).toFixed(3) : 1, violations };
}

// Application metric: recall proves a policy is retrieved; application proves its
// rule text actually reaches the composed prompt an agent reads. They diverge
// when a policy matches by trigger but carries no usable body.
function scoreApplication(scenarios) {
    let expected = 0;
    let applied = 0;
    const misses = [];

    for (const s of scenarios) {
        const policies = search(s.prompt);
        const block = renderPolicyBlock(policies);
        for (const want of s.expect) {
            expected++;
            const policy = policies.find((p) => p.id.includes(want));
            const head = policy?.body ? policy.body.split("\n")[0].slice(0, 40) : "";
            if (head && block.includes(head)) {
                applied++;
            } else {
                misses.push(`${s.name} -> ${want}`);
            }
        }
    }

    return { expected, applied, rate: expected ? +(applied / expected).toFixed(3) : 1, misses };
}

// Collect the full metric set.
export function measure() {
    const scenarios = loadScenarios();
    const recall = scoreRecall(scenarios);
    const precision = scorePrecision(scenarios);
    const application = scoreApplication(scenarios);
    const health = doctor();

    return {
        date: today(),
        scenarios: scenarios.length,
        policyRecall: recall.rate,
        recalledOf: `${recall.recalled}/${recall.expected}`,
        recallMisses: recall.misses,
        policyApplication: application.rate,
        applicationMisses: application.misses,
        precision: precision.rate,
        falseSurfaces: precision.falseSurfaces,
        precisionViolations: precision.violations,
        docHealthy: health.ok,
        docChecksPassed: health.summary,
        specCapabilities: listSpecs().length,
        // Lower is better: expected policies that were not recalled.
        clarifyingQuestions: recall.expected - recall.recalled
    };
}

export function saveBaseline() {
    mkdirSync(BENCH_DIR, { recursive: true });
    const m = measure();
    writeFileSync(BASELINE, JSON.stringify(m, null, 2) + "\n");
    return BASELINE;
}

// Compare current metrics against the frozen baseline.
export function compare({ baselineFile = BASELINE } = {}) {
    if (!existsSync(baselineFile)) {
        return { error: "no baseline yet - run `hos bench --baseline` first", current: measure() };
    }

    const base = JSON.parse(readFileSync(baselineFile, "utf8"));
    const now = measure();
    const delta = (key, higherIsBetter) => {
        const d = +(now[key] - base[key]).toFixed(3);
        return { from: base[key], to: now[key], delta: d, verdict: d === 0 ? "same" : (d > 0) === higherIsBetter ? "better" : "worse" };
    };

    return {
        baselineDate: base.date,
        currentDate: now.date,
        scenarios: delta("scenarios", true),
        policyRecall: delta("policyRecall", true),
        policyApplication: delta("policyApplication", true),
        precision: delta("precision", true),
        falseSurfaces: delta("falseSurfaces", false),
        clarifyingQuestions: delta("clarifyingQuestions", false),
        specCapabilities: delta("specCapabilities", true),
        docHealthy: { from: base.docHealthy, to: now.docHealthy, verdict: now.docHealthy ? "ok" : "regressed" },
        recallMisses: now.recallMisses,
        precisionViolations: now.precisionViolations
    };
}

// Improvement must come from a retrieval-quality metric or broader coverage, not
// from a raw count. A bare spec or capability increment no longer qualifies a
// contribution as eligible - that closes the "add a file to pass the gate" hole.
export function hasImprovement(proof) {
    return Boolean(proof) && !proof.error && [
        proof.scenarios,
        proof.policyRecall,
        proof.policyApplication,
        proof.precision,
        proof.falseSurfaces
    ].some((metric) => metric?.verdict === "better");
}

export function hasRegression(proof) {
    return !proof || Boolean(proof.error)
        || proof.policyRecall?.verdict === "worse"
        || proof.policyApplication?.verdict === "worse"
        || proof.precision?.verdict === "worse"
        || proof.falseSurfaces?.verdict === "worse"
        || proof.docHealthy?.verdict === "regressed";
}
