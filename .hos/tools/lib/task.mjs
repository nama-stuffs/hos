// Task playbooks: keyword-activated, reusable procedures under .hos/task/. A
// request is matched against playbook triggers with the same tokenizer as memory
// recall, so asking an agent to "optimize" or "audit" surfaces the right
// playbook. Matching is advisory; the conductor decides. See AGENTS.md.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TASK_DIR } from "./paths.mjs";
import { tokenize } from "./util.mjs";
import * as fm from "./frontmatter.mjs";

function files() {
    return existsSync(TASK_DIR)
        ? readdirSync(TASK_DIR).filter((f) => f.endsWith(".md") && f !== "README.md")
        : [];
}

function load(file) {
    const { data, body } = fm.parse(readFileSync(join(TASK_DIR, file), "utf8"));
    return {
        name: data.name || file.replace(/\.md$/, ""),
        triggers: data.triggers || [],
        summary: data.summary || "",
        file,
        body
    };
}

// Keys a playbook matches on: its trigger words plus its name, tokenized.
function keys(playbook) {
    return new Set([...playbook.triggers.flatMap((t) => tokenize(String(t))), ...tokenize(playbook.name)]);
}

export function list() {
    return files().map(load).map(({ name, triggers, summary }) => ({ name, triggers, summary }));
}

// Rank playbooks by how many request tokens hit their keys, strongest first. An
// empty result means no playbook applies; a tie leaves the choice to the agent.
export function match(text) {
    const words = new Set(tokenize(text));
    return files()
        .map(load)
        .map((p) => ({ name: p.name, summary: p.summary, score: [...keys(p)].reduce((s, k) => s + (words.has(k) ? 1 : 0), 0) }))
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score);
}

export function show(name) {
    const file = files().find((f) => f === `${name}.md` || load(f).name === name);
    if (!file) {
        throw new Error(`no such task playbook: ${name} (try: hos task list)`);
    }
    return load(file).body;
}
