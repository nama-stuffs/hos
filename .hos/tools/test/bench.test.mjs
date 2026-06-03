// Benchmark depth: a raw capability count must not make a contribution eligible
// (anti-gaming), and measure() must expose the precision/application signals.
// The eligibility verdicts are pure functions, tested on proof skeletons.

import { test } from "node:test";
import assert from "node:assert/strict";
import { measure, hasImprovement, hasRegression } from "../lib/bench.mjs";

function proof(overrides = {}) {
    const same = { verdict: "same" };
    return {
        scenarios: same,
        policyRecall: same,
        policyApplication: same,
        precision: same,
        falseSurfaces: same,
        clarifyingQuestions: same,
        specCapabilities: same,
        docHealthy: { verdict: "ok" },
        ...overrides
    };
}

test("adding a capability alone is not an improvement (closes the add-a-file hole)", () => {
    const p = proof({ specCapabilities: { verdict: "better" } });
    assert.equal(hasImprovement(p), false);
    assert.equal(hasRegression(p), false);
});

test("a retrieval-quality gain or more coverage counts as improvement", () => {
    assert.equal(hasImprovement(proof({ policyRecall: { verdict: "better" } })), true);
    assert.equal(hasImprovement(proof({ policyApplication: { verdict: "better" } })), true);
    assert.equal(hasImprovement(proof({ precision: { verdict: "better" } })), true);
    assert.equal(hasImprovement(proof({ falseSurfaces: { verdict: "better" } })), true);
    assert.equal(hasImprovement(proof({ scenarios: { verdict: "better" } })), true);
});

test("a precision/application/recall drop is a regression; a capability drop is not", () => {
    assert.equal(hasRegression(proof({ precision: { verdict: "worse" } })), true);
    assert.equal(hasRegression(proof({ policyApplication: { verdict: "worse" } })), true);
    assert.equal(hasRegression(proof({ falseSurfaces: { verdict: "worse" } })), true);
    assert.equal(hasRegression(proof({ docHealthy: { verdict: "regressed" } })), true);
    assert.equal(hasRegression(proof({ specCapabilities: { verdict: "worse" } })), false);
});

test("measure exposes recall, application, and precision; the seed set is clean", () => {
    const m = measure();
    assert.equal(typeof m.policyRecall, "number");
    assert.equal(typeof m.policyApplication, "number");
    assert.equal(typeof m.precision, "number");
    assert.equal(typeof m.falseSurfaces, "number");
    assert.equal(m.falseSurfaces, 0, "no over-broad triggers in the seed scenarios");
});
