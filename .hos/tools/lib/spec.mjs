// Functional specification helpers. The spec is acceptance-criteria-first: each
// capability is defined primarily by atomic, checkable criteria. See
// doc/protocol/spec.md.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SPEC_DIR, SPEC_INDEX } from "./paths.mjs";
import { slugify, today, toPosix, writeFileAtomic } from "./util.mjs";
import * as fm from "./frontmatter.mjs";

const TEMPLATE = () => `## Purpose

What this capability is for and who relies on it. One or two lines.

## Acceptance Criteria

Atomic, observable, ordered, and non-redundant: one assertion per item, related
items adjacent. Keep the set minimal - the fewest criteria that fully constrain
the behavior. Decompose any criterion that hides more than one assertion.

- [ ] _(one checkable assertion)_

## Validation

The check, test, or scenario that proves each criterion above. Point at test
files once they exist.
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

// Cheap, advisory hygiene. Flags criteria that look compound (split them) or that
// duplicate another (redundant). Not a hard gate: minimality is judgement, owned
// by the curator lens.
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
            const key = criterion.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            if (seen.has(key)) {
                issues.push({ path: cap.path, criterion, kind: "duplicate", hint: `repeats a criterion in ${seen.get(key)}` });
            } else {
                seen.set(key, cap.path);
            }
        }
    }

    return { total: all.reduce((n, c) => n + c.criteria.length, 0), issues };
}

export function add({ title, area = "", acceptance = [] }) {
    const dir = area ? join(SPEC_DIR, ...area.split("/").map(slugify)) : SPEC_DIR;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${slugify(title)}.md`);
    if (existsSync(file)) {
        return file;
    }

    const data = { title, area, status: "draft", updated: today() };
    let body = TEMPLATE();
    if (acceptance.length) {
        body = body.replace("- [ ] _(one checkable assertion)_", acceptance.map((a) => `- [ ] ${a}`).join("\n"));
    }

    writeFileSync(file, fm.serialize(data, body));
    rebuildIndex();
    return file;
}

export function rebuildIndex() {
    mkdirSync(SPEC_DIR, { recursive: true });
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
}
