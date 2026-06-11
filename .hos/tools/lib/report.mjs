// Renders a structured session report for one user request in markdown or HTML.
// See doc/protocol/report.md.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { REPORTS_DIR, TICKETS_DIR } from "./paths.mjs";
import { gather, latestAttached } from "./session.mjs";
import { sessionMetrics } from "./metrics.mjs";
import { today, toPosix } from "./util.mjs";

const REASON_LABEL = {
    task: "Task", subtask: "Sub-task", friction: "Friction handling",
    retrospective: "Retrospective / optimization", bugfix: "Bug found & fixed"
};

function ticketDetail(id) {
    const dir = join(TICKETS_DIR, id);
    const md = join(dir, "ticket.md");
    if (!existsSync(md)) {
        return { id, title: id, status: "?", shots: [] };
    }

    const text = readFileSync(md, "utf8");
    const title = /title:\s*(.+)/.exec(text)?.[1]?.trim() || id;
    const status = /status:\s*(.+)/.exec(text)?.[1]?.trim() || "?";
    const evidence = join(dir, "evidence");
    const shots = existsSync(evidence)
        ? readdirSync(evidence)
            .filter((f) => [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extname(f).toLowerCase()))
            .map((f) => join(evidence, f))
        : [];
    return { id, title, status, shots };
}

function groupByReason(tickets) {
    const groups = {};
    for (const t of tickets) {
        (groups[t.reason] ||= []).push(t.ticket);
    }
    return groups;
}

// Build the report model from a session.
function model(sessionId) {
    const s = gather(sessionId);
    const groups = groupByReason(s.tickets);
    const detail = Object.fromEntries(s.tickets.map((t) => [t.ticket, ticketDetail(t.ticket)]));
    return { ...s, groups, detail, metrics: sessionMetrics(sessionId) };
}

// One short delivery summary. Diagnostic only - harness quality is proven by the
// benchmark, not by these counts (see doc/protocol/retrospective.md).
function optimizationLines(o) {
    return o ? [
        "## Optimization", "",
        `- Tickets: ${o.tickets} (verified: ${o.verifiedTickets})`,
        `- Retrospectives: ${o.retrospectives}${o.retroOutcomes.length ? ` - ${o.retroOutcomes.join(", ")}` : ""}`,
        `- Reopens: ${o.totalReopens} | Blocked: ${o.totalBlocked} | Verify pass/fail: ${o.verifyPass}/${o.verifyFail}`,
        `- Evidence files: ${o.totalEvidence}`, "",
        "_Delivery metrics are diagnostic; harness-quality proof is `hos bench --compare`._", ""
    ] : [];
}

function optimizationHtml(o) {
    if (!o) {
        return "";
    }
    return "<section><h2>Optimization</h2><ul>"
        + `<li>Tickets: ${o.tickets} (verified: ${o.verifiedTickets})</li>`
        + `<li>Retrospectives: ${o.retrospectives}${o.retroOutcomes.length ? ` - ${o.retroOutcomes.join(", ")}` : ""}</li>`
        + `<li>Reopens: ${o.totalReopens} | Blocked: ${o.totalBlocked} | Verify pass/fail: ${o.verifyPass}/${o.verifyFail}</li>`
        + `<li>Evidence files: ${o.totalEvidence}</li></ul>`
        + `<p class="status">Delivery metrics are diagnostic; harness-quality proof is hos bench --compare.</p></section>`;
}

function toMarkdown(m) {
    const lines = [`# Session report - ${m.id}`, "", `**Request:** ${m.request}`, ""];
    if (m.summary) {
        lines.push(m.summary, "");
    }
    lines.push(`**Tickets produced:** ${m.tickets.length}`, "");

    for (const [reason, ids] of Object.entries(m.groups)) {
        lines.push(`## ${REASON_LABEL[reason] || reason}`, "");
        for (const id of ids) {
            const d = m.detail[id];
            lines.push(`### ${id} - ${d.title}  \n_status: ${d.status}_`, "");
            for (const shot of d.shots) {
                lines.push(`![${basename(shot)}](${shot})`, "");
            }
        }
    }
    lines.push(...optimizationLines(m.metrics));
    return lines.join("\n");
}

function toHtml(m) {
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const img = (p) => {
        const src = `data:image/${extname(p).slice(1)};base64,${readFileSync(p).toString("base64")}`;
        return `<figure><img src="${src}" alt="${esc(basename(p))}"/>`
            + `<figcaption>${esc(basename(p))}</figcaption></figure>`;
    };
    const sections = Object.entries(m.groups).map(([reason, ids]) => {
        const items = ids.map((id) => {
            const d = m.detail[id];
            return `<article><h3>${esc(id)} - ${esc(d.title)}</h3>`
                + `<p class="status">status: ${esc(d.status)}</p>`
                + `${d.shots.map(img).join("")}</article>`;
        }).join("");
        return `<section><h2>${esc(REASON_LABEL[reason] || reason)}</h2>${items}</section>`;
    }).join("");

    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Session report ${esc(m.id)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;color:#0f172a}
h1{border-bottom:2px solid #2563eb;padding-bottom:.3rem}
h2{margin-top:2rem}
article{border:1px solid #e2e8f0;border-radius:8px;padding:1rem;margin:1rem 0}
.status{color:#64748b;font-size:.85rem;margin:.2rem 0 1rem}
figure{margin:1rem 0}
img{max-width:100%;border:1px solid #e2e8f0;border-radius:6px}
figcaption{color:#64748b;font-size:.8rem}
</style></head><body>
<h1>Session report - ${esc(m.id)}</h1><p><strong>Request:</strong> ${esc(m.request)}</p>
${m.summary ? `<p>${esc(m.summary)}</p>` : ""}<p><strong>Tickets produced:</strong> ${m.tickets.length}</p>
${sections}${optimizationHtml(m.metrics)}</body></html>`;
}

// Render a report for a session (defaults to the latest one that gathered
// tickets, so a bare verification context never steals the report) in the given
// formats. Returns the written file paths. Screenshots are referenced (md) or
// inlined (html).
export function render(sessionId = null, formats = ["md", "html"]) {
    const id = sessionId || latestAttached();
    if (!id) {
        throw new Error("no session to report on - open one with `hos session open \"<request>\"` (Inter does this at intake), or render a single ticket with `hos ticket report <id>`");
    }

    const m = model(id);
    mkdirSync(REPORTS_DIR, { recursive: true });
    const written = [];

    for (const format of formats) {
        const file = join(REPORTS_DIR, `${id}-${today()}.${format}`);
        writeFileSync(file, format === "html" ? toHtml(m) : toMarkdown(m));
        written.push(toPosix(file));
    }
    return written;
}
