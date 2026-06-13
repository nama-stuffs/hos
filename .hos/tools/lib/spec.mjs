// Functional specification helpers. The spec is acceptance-criteria-first: each
// capability is defined primarily by atomic, checkable criteria. See
// doc/protocol/spec.md.

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { SPEC_DIR, SPEC_INDEX } from "./paths.mjs";
import { slugify, today, toPosix, withLock, writeFileAtomic } from "./util.mjs";
import * as fm from "./frontmatter.mjs";

const TEMPLATE = () => `## Purpose

Why this capability exists and who relies on it, in behavioural terms. One or two
lines. No implementation.

## Acceptance Criteria

This section is the whole specification. State the capability as atomic,
observable, behavioural assertions - someone with no access to the code must be
able to rebuild the behaviour from these alone. Cover every observable dimension
*as criteria*: inputs and outputs, state transitions, errors, edge cases,
externally visible formats and limits. Describe WHAT is observed, never HOW it is
built: no file, function, class, framework, or data-store names. If a criterion
can only be understood by reading the code, it is not a criterion yet.

Atomic (one assertion each), minimal, non-redundant, ordered: happy path, then
states, then errors and edges.

- [ ] _(one observable, code-free assertion)_

## Validation

An executable anchor that proves each criterion - a test file path or a runnable
command, not prose. This is what a spec-only rebuild runs to prove it succeeded.
`;

function specFiles(dir = SPEC_DIR) {
    if (!existsSync(dir)) {
        return [];
    }

    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? specFiles(join(dir, e.name))
            : e.name.endsWith(".md") && !["index.md", "README.md"].includes(e.name) ? [join(dir, e.name)] : []
    );
}

// Acceptance criteria are the checkbox lines; one assertion each. The scaffold
// placeholder (`_(...)_`) does not count.
function parseCriteria(text) {
    return [...text.matchAll(/^[ \t]*-[ \t]+\[[ xX]\][ \t]+(.+)$/gm)]
        .map((m) => m[1].trim())
        .filter((line) => line && !/^_\(.*\)_$/.test(line));
}

function rel(file) {
    return toPosix(relative(SPEC_DIR, file));
}

// One body section's text by heading. No m flag: a per-line $ would stop the
// lazy capture at the section's first line.
function sectionText(body, title) {
    return new RegExp(`(?:^|\\n)##\\s+${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i").exec(body)?.[1]?.trim() || "";
}

const isPlaceholder = (text) => !text || /^_\(.*\)_$/.test(text.trim());

// Implementation language that has no place in a code-free spec. Each signal
// turns a criterion (or Purpose) into a code-leak: the behaviour must be
// restated as something observable, so a spec-only rebuild is never steered
// toward one implementation. See doc/audit/spec.md.
const CODE_LEAK = [
    { rx: /`[^`]*[a-z][A-Z][^`]*`|`[a-z0-9]+_[a-z0-9_]+`|`\w+\(\)`|`\w+\.\w+`/, signal: "a code identifier" },
    { rx: /\.(mjs|cjs|js|jsx|ts|tsx|py|rb|go|java|rs|php|cs|sql|css|scss|html)\b/i, signal: "a source filename" },
    { rx: /\b(function|method|class|subclass|variable|constant|parameter|controller|service|repository|component|middleware|module|helper|singleton|interface|enum|struct)\b/i, signal: "an implementation noun" },
    { rx: /\b(database|db table|table|column|foreign key|primary key|orm|sql|query|migration|index file)\b/i, signal: "a storage-internal noun" },
    { rx: /\b(react|vue|angular|svelte|express|django|flask|rails|spring|laravel|postgres|postgresql|mysql|sqlite|mongodb|redis|kafka|graphql|tailwind|bootstrap|node\.js|typescript|javascript)\b/i, signal: "a technology name" },
    { rx: /\b(instantiate|invoke|return value|throws?\b|catch(es)? the|route handler|api (route|endpoint|handler))\b/i, signal: "a code operation" },
    { rx: /\b(see|refer to|as in|per|defined in|look at) (the )?(code|source|implementation|codebase|repo|repository)\b/i, signal: "a reference to the code" }
];

function codeLeaks(text) {
    return CODE_LEAK.filter((s) => s.rx.test(text)).map((s) => s.signal);
}

// A Validation section earns its name when it names something runnable - a test
// file or a command - rather than describing a check in prose. A spec-only
// rebuild executes these to prove it reproduced the behaviour.
function validationIsExecutable(text) {
    if (isPlaceholder(text)) {
        return false;
    }
    return /`[^`]+`/.test(text)                                  // a backticked command
        || /[\w./-]+\.(test|spec)\.[a-z0-9]+\b/i.test(text)      // a test file
        || /\b(test|tests|spec|specs|e2e|__tests__)\/[\w./-]+/i.test(text); // a test path
}

// Per-capability readiness for a spec-only rebuild: a current behavioural
// Purpose, at least one criterion, an executable Validation, and no code leak in
// Purpose or any criterion. This is what makes "rebuild from the spec alone"
// mechanically checkable. See doc/protocol/spec.md.
function reconstructionAudit() {
    return specFiles().map((file) => {
        const text = readFileSync(file, "utf8");
        const { data, body } = fm.parse(text);
        const path = rel(file);
        const purpose = sectionText(body, "Purpose");
        const validation = sectionText(body, "Validation");
        const crits = parseCriteria(text);

        const gaps = [];
        if (isPlaceholder(purpose)) {
            gaps.push("Purpose is empty");
        }
        if (!crits.length) {
            gaps.push("no acceptance criteria");
        }
        if (!validationIsExecutable(validation)) {
            gaps.push("Validation is not executable (name a test file or a runnable command)");
        }

        const leaks = [];
        for (const [where, value] of [["Purpose", purpose], ...crits.map((c, i) => [`criterion ${i + 1}`, c])]) {
            const signals = codeLeaks(value);
            if (signals.length) {
                leaks.push({ where, signals, text: value });
            }
        }

        return {
            path,
            capability: data.title || path,
            criteria: crits.length,
            executableValidation: validationIsExecutable(validation),
            gaps,
            leaks,
            ready: gaps.length === 0 && leaks.length === 0
        };
    });
}

export function list() {
    return specFiles().map((file) => {
        const text = readFileSync(file, "utf8");
        const { data } = fm.parse(text);
        return {
            path: rel(file),
            title: data.title || rel(file),
            status: data.status || "draft",
            area: data.area || "",
            criteria: parseCriteria(text).length
        };
    });
}

// Collect every acceptance criterion across the spec, grouped by capability. This
// is the automatic AC view of the product's areas.
export function criteria() {
    return specFiles().map((file) => {
        const text = readFileSync(file, "utf8");
        const { data } = fm.parse(text);
        return {
            capability: data.title || rel(file),
            area: data.area || "",
            path: rel(file),
            criteria: parseCriteria(text)
        };
    });
}

// Spec hygiene plus the reconstruction gate. Compound and duplicate criteria are
// advisory curator quality; code-leak and the reconstruction gaps are the hard
// signal behind `hos spec lint --strict` - they decide whether the spec alone
// could rebuild the behaviour. `reconstruction.score` is the fraction of
// capabilities a spec-only rebuild could reproduce. See doc/audit/spec.md.
export function lint() {
    const all = criteria();
    const issues = [];
    const seen = new Map();
    const compound = /\b(and|then)\b|;| & /i;

    for (const cap of all) {
        for (const criterion of cap.criteria) {
            if (compound.test(criterion)) {
                issues.push({ path: cap.path, criterion, kind: "compound", hint: "split into one assertion per criterion" });
            }
            const leaks = codeLeaks(criterion);
            if (leaks.length) {
                issues.push({ path: cap.path, criterion, kind: "code-leak", hint: `restate without ${leaks.join(", ")} - say what is observed, not how it is built` });
            }
            const key = criterion.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            if (seen.has(key)) {
                issues.push({ path: cap.path, criterion, kind: "duplicate", hint: `repeats a criterion in ${seen.get(key)}` });
            } else {
                seen.set(key, cap.path);
            }
        }
    }

    const audit = reconstructionAudit();
    for (const cap of audit) {
        for (const gap of cap.gaps) {
            issues.push({ path: cap.path, kind: "reconstruction", hint: gap });
        }
        // Criterion leaks are already added above; this catches a leak in Purpose.
        for (const site of cap.leaks.filter((s) => s.where === "Purpose")) {
            issues.push({ path: cap.path, kind: "code-leak", hint: `Purpose names ${site.signals.join(", ")} - keep Purpose behavioural` });
        }
    }

    const ready = audit.filter((c) => c.ready).length;
    return {
        total: all.reduce((n, c) => n + c.criteria.length, 0),
        issues,
        reconstruction: {
            ready,
            total: audit.length,
            score: audit.length ? Number((ready / audit.length).toFixed(3)) : 1,
            notReady: audit.filter((c) => !c.ready).map((c) => ({
                path: c.path,
                gaps: c.gaps,
                leaks: c.leaks.map((s) => `${s.where}: ${s.signals.join(", ")}`)
            }))
        }
    };
}

export function add({ title, area = "", acceptance = [] }) {
    const dir = area ? join(SPEC_DIR, ...area.split("/").map(slugify)) : SPEC_DIR;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${slugify(title)}.md`);
    if (existsSync(file)) {
        // Re-adding heals the index: parallel adds race the dir-scan-then-write
        // rebuild, so any later spec touch converges it.
        rebuildIndex();
        return file;
    }

    const data = { title, area, status: "draft", updated: today() };
    let body = TEMPLATE();
    if (acceptance.length) {
        body = body.replace("- [ ] _(one observable, code-free assertion)_", acceptance.map((a) => `- [ ] ${a}`).join("\n"));
    }

    // Atomic, so a sibling add never scans a half-written capability file.
    writeFileAtomic(file, fm.serialize(data, body));
    rebuildIndex();
    return file;
}

// Locked like the ticket index: each parallel add rebuilds after its own file
// landed, so the last rebuild in lock order has seen every finished add and
// the index converges complete - no lost row, no manual re-sync.
export function rebuildIndex() {
    mkdirSync(SPEC_DIR, { recursive: true });
    return withLock("spec-index", () => {
        const rows = list().sort((a, b) => a.path.localeCompare(b.path))
            .map((s) => `| [${s.title}](${s.path}) | \`${s.area || "-"}\` | ${s.criteria} | ${s.status} |`);
        const out = [
            "# Functional Specification", "",
            "Generated index. Do not edit by hand. Capabilities are defined by their",
            "acceptance criteria; see `.hos/doc/protocol/spec.md`.", "",
            "| Capability | Area | Criteria | Status |", "| ---------- | ---- | -------- | ------ |",
            ...(rows.length ? rows : ["| _none yet_ | - | - | - |"]), ""
        ].join("\n");
        writeFileAtomic(SPEC_INDEX, out);
        return SPEC_INDEX;
    });
}
