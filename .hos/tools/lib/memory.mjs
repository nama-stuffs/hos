// Say-once store: markdown policies under .hos/memory/.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FRICTION_DIR, MEMORY_DIR, MEMORY_INDEX, POLICY_DIR } from "./paths.mjs";
import { slugify, today, tokenize, writeFileAtomic } from "./util.mjs";
import * as fm from "./frontmatter.mjs";

// tokenize lives in util.mjs (shared with task matching); re-exported so callers
// and tests that read it from the memory store keep working.
export { tokenize };

function ensureDirs() {
    for (const dir of [MEMORY_DIR, POLICY_DIR, FRICTION_DIR]) {
        mkdirSync(dir, { recursive: true });
    }
}

function readDir(dir) {
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md") : [];
}

// Load every policy as { id, title, scope, triggers, status, body, file }.
export function loadPolicies() {
    return readDir(POLICY_DIR).map((file) => {
        const parsed = fm.parse(readFileSync(join(POLICY_DIR, file), "utf8"));
        return {
            file,
            id: parsed.data.id || file.replace(/\.md$/, ""),
            ...parsed.data,
            kind: parsed.data.kind || "policy",
            triggers: parsed.data.triggers || [],
            body: parsed.body
        };
    });
}

// Active entries, optionally narrowed by scope (bidirectional prefix, so an
// unscoped or broader rule still applies) and by kind. An unscoped entry is global
// and always in scope.
function active({ scope = null, kind = null } = {}) {
    return loadPolicies()
        .filter((p) => (p.status || "active") === "active")
        .filter((p) => !kind || (p.kind || "policy") === kind)
        .filter((p) => !scope || !p.scope || scope.startsWith(p.scope) || p.scope.startsWith(scope));
}

// Score entries against free text by trigger and title-keyword overlap; return the
// matches sorted strongest-first. This is what every persona calls before acting so
// settled rules and facts are pre-applied. `kind` filters to one memory type.
export function search(text, { scope = null, kind = null, limit = 20 } = {}) {
    const words = new Set(tokenize(text));
    return active({ scope, kind })
        .map((p) => ({
            policy: p,
            score: [...(p.triggers || []), ...tokenize(p.title || "")]
                .reduce((s, t) => s + (words.has(t.toLowerCase()) ? 1 : 0), 0)
        }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((m) => m.policy);
}

// All active entries in a namespace, regardless of keywords - used to compose a
// persona's standing memory (e.g. scope "persona/architect"). See orchestration.md.
export function byScope(scope, { kind = null } = {}) {
    if (!scope) {
        return [];
    }
    return active({ kind }).filter((p) => p.scope === scope || (p.scope || "").startsWith(`${scope}/`));
}

// All active entries of a kind, regardless of keywords - used to surface logged
// harness-change intents at upgrade time. See doc/protocol/upgrade.md.
export function byKind(kind) {
    return active({ kind });
}

// Render matched policies as the "Active policies" block injected into composed
// prompts. Shared by `hos compose` and the benchmark so both exercise the exact
// text an executing agent sees. Returns "" when nothing matched.
export function renderPolicyBlock(policies) {
    if (!policies.length) {
        return "";
    }
    return "# Active policies (say-once memory)\n\n"
        + policies.map((p) => `- **${p.title}** - ${p.body}`).join("\n");
}

// Add (or update) a durable policy. The slug of the title is the id and the
// filename, so re-stating the same rule updates one file instead of spawning a
// numbered duplicate. Returns the file path.
export function addPolicy({ title, body, scope = "", kind = "policy", triggers = [], source = "user" }) {
    ensureDirs();
    const slug = slugify(title);
    // Policies keep the bare slug (stable ids); other kinds carry a kind prefix so a
    // fact and a policy with the same title never collide on one file.
    const id = kind === "policy" ? slug : `${kind}-${slug}`;
    const file = join(POLICY_DIR, `${id}.md`);
    const data = {
        id, title, scope, kind, status: "active", source,
        triggers: triggers.length ? triggers : tokenize(title).slice(0, 8),
        created: today()
    };
    writeFileSync(file, fm.serialize(data, body || title));
    rebuildIndex();
    return file;
}

// Append a raw friction note (slug-named) for later graduation into a policy.
export function addFriction({ title, body }) {
    ensureDirs();
    const id = slugify(title);
    const file = join(FRICTION_DIR, `${id}.md`);
    writeFileSync(file, fm.serialize({ id, title, created: today() }, body || title));
    return file;
}

// Regenerate index.md as the human-readable map of all policies.
export function rebuildIndex() {
    ensureDirs();
    const rows = loadPolicies()
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((p) => `| \`${p.id}\` | ${p.kind || "policy"} | ${p.title} | \`${p.scope || "-"}\` | ${p.status || "active"} | ${p.source || "-"} |`);
    const out = [
        "# Memory Index",
        "",
        "Every memory entry in this store (policy, fact, episode, harness-change). The",
        "id is the filename slug (merge-safe, no counters). Generated by `hos memory",
        "index` -- do not edit by hand. See `.hos/doc/protocol/memory.md`.",
        "",
        "| ID | Kind | Title | Scope | Status | Source |",
        "| -- | ---- | ----- | ----- | ------ | ------ |",
        ...(rows.length ? rows : ["| - | - | _none yet_ | - | - | - |"]),
        ""
    ].join("\n");
    writeFileAtomic(MEMORY_INDEX, out);
    return MEMORY_INDEX;
}
