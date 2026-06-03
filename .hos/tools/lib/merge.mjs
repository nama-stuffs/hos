// AGENTS.md merge for adoption.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS_MD, HOS_DIR } from "./paths.mjs";
import { toPosix } from "./util.mjs";

const MARKER = "<!-- HOS:begin -->";
const END_MARKER = "<!-- HOS:end -->";

// The canonical HOS agent entry, as a target should receive it. It ships inside
// .hos/ so an adopted project (whose root AGENTS.md is the host's) can still get
// real HOS content for the `hos-primary` strategy. In the source repo the
// template equals AGENTS.md (doctor enforces no drift).
const AGENTS_TEMPLATE = join(HOS_DIR, "agents.template.md");

export function hosAgentsContent() {
    return readFileSync(existsSync(AGENTS_TEMPLATE) ? AGENTS_TEMPLATE : AGENTS_MD, "utf8");
}

function hosSection() {
    return `${MARKER}
## HOS

This project also runs HOS under [\`.hos/\`](.hos/). Agents use
\`node .hos/tools/hos.mjs <cmd>\`.

Golden rules:

1. Pull matching memory before acting: \`hos memory search\`.
2. Keep \`.hos/doc/spec/\` current for touched capabilities.
3. Load only the files needed for the current step.
4. Follow \`.hos/doc/protocol/\`.
5. Surface reusable decisions and friction for the retrospective.
${END_MARKER}`;
}

export const STRATEGIES = {
    append: "Keep the host AGENTS.md and append a marked ## HOS section.",
    "hos-primary": "Make HOS primary; preserve the host file as AGENTS.local.md.",
    manual: "Make no automatic change."
};

export function planAgentsMerge(target = AGENTS_MD) {
    if (!existsSync(target)) {
        return { state: "absent", action: "copy-hos-agents" };
    }

    const text = readFileSync(target, "utf8");
    if (text.includes(MARKER)) {
        return { state: "already-hos", action: "noop" };
    }

    return {
        state: "has-content",
        action: "ask",
        questions: [{
            id: "agents-merge",
            question: "This project already has an AGENTS.md. How should HOS join it?",
            options: Object.entries(STRATEGIES).map(([id, label]) => ({ id, label })),
            recommended: "append"
        }]
    };
}

export function applyAgentsMerge({ target = AGENTS_MD, strategy = "append", hosAgents = "" } = {}) {
    const plan = planAgentsMerge(target);

    if (plan.state === "absent") {
        writeFileSync(target, hosAgents);
        return { ok: true, state: "absent", strategy: "copy", wrote: toPosix(target) };
    }
    if (plan.state === "already-hos") {
        return { ok: true, state: "already-hos", strategy: "noop", wrote: null };
    }

    const host = readFileSync(target, "utf8");
    if (strategy === "manual") {
        return { ok: true, state: "has-content", strategy: "manual", wrote: null };
    }
    if (strategy === "hos-primary") {
        writeFileSync(target.replace(/AGENTS\.md$/, "AGENTS.local.md"), host);
        writeFileSync(target, hosAgents);
        return { ok: true, state: "has-content", strategy: "hos-primary", wrote: toPosix(target), preserved: "AGENTS.local.md" };
    }

    writeFileSync(target, `${host.trimEnd()}\n\n${hosSection()}\n`);
    return { ok: true, state: "has-content", strategy: "append", wrote: toPosix(target) };
}
