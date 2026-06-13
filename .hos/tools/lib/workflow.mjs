// Executable workflow contract for the Inter -> Alpha -> composed lenses ->
// verification -> report/retro path. The protocols describe the intent; this
// module makes the objective parts checkable.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_LOG, TICKETS_DIR } from "./paths.mjs";
import { settings } from "./config.mjs";
import { writeFileAtomic } from "./util.mjs";
import * as ledger from "./ledger.mjs";
import * as memory from "./memory.mjs";
import * as session from "./session.mjs";
import * as task from "./task.mjs";

const LIFECYCLE = ["intake", "planning", "execution", "verification", "closure", "retrospective"];
const STEP_FIELDS = ["id", "role", "intent", "actor", "level", "inputs", "acceptance", "evidence", "onFail"];

function ticketDir(id) {
    return join(TICKETS_DIR, id);
}

function evidenceCount(id) {
    const dir = join(ticketDir(id), "evidence");
    return existsSync(dir) ? readdirSync(dir).length : 0;
}

function readSessions() {
    return existsSync(SESSIONS_LOG)
        ? readFileSync(SESSIONS_LOG, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
        : [];
}

function sessionOpenIds(events = readSessions()) {
    return new Set(events.filter((event) => event.event === "open").map((event) => event.id));
}

function sessionAttachments(events = readSessions()) {
    return events.filter((event) => event.event === "attach");
}

function attachedSessionsForTicket(id) {
    const events = readSessions();
    const open = sessionOpenIds(events);
    return sessionAttachments(events)
        .filter((event) => event.ticket === id && open.has(event.id))
        .map((event) => event.id);
}

function ticketExists(id) {
    return Boolean(id) && existsSync(join(ticketDir(id), "ticket.md"));
}

// Without the m flag: with it, the $ alternative matches at every line end and
// the lazy body stops after the section's first line - multi-line acceptance
// silently shrank to one criterion.
function section(body, title) {
    const rx = new RegExp(`(?:^|\\n)## ${title}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`);
    return rx.exec(body)?.[1]?.trim() || "";
}

// How many acceptance criteria a ticket carries: checkbox lines, else bullet
// lines, else one for any non-placeholder prose. More than scope.maxAcceptance
// on a childless ticket means the scope is compound and must be split.
function criteriaCount(body) {
    const text = section(body, "Acceptance");
    if (!text || text === "_(define before marking fixed)_") {
        return 0;
    }
    const boxes = text.match(/^[ \t]*-[ \t]+\[[ xX]\]/gm);
    if (boxes) {
        return boxes.length;
    }
    const bullets = text.match(/^[ \t]*-[ \t]+/gm);
    return bullets ? bullets.length : 1;
}

function maxAcceptance() {
    return settings().scope?.maxAcceptance ?? 3;
}

function actorText(actor) {
    if (!actor) {
        return "";
    }
    if (typeof actor === "string") {
        return actor;
    }
    const base = actor.base || "";
    const lenses = Array.isArray(actor.lenses) ? actor.lenses : [];
    return [base, ...lenses].filter(Boolean).join("+");
}

// Canonical identity of a composed actor: the set of lenses, order- and
// duplicate-insensitive, so `ux+frontend` and `frontend+ux` are the same actor
// and cannot dodge the executor/verifier separation check.
function actorKey(actor) {
    return [...new Set(actorText(actor).split(/[+,]/).map((s) => s.trim()).filter(Boolean))].sort().join("+");
}

function stepRole(step) {
    return String(step.role || step.kind || "").toLowerCase();
}

function readPlan(id) {
    const file = join(ticketDir(id), "plan.json");
    if (!existsSync(file)) {
        return { plan: null, error: "missing plan.json" };
    }
    try {
        return { plan: JSON.parse(readFileSync(file, "utf8")), error: "" };
    } catch (error) {
        return { plan: null, error: `plan.json does not parse: ${error.message}` };
    }
}

function validatePlan(id) {
    const errors = [];
    const warnings = [];
    const { plan, error } = readPlan(id);
    if (error) {
        return { errors: [error], warnings, plan: null };
    }

    if (plan.ticket !== id) {
        errors.push(`plan.ticket must be ${id}`);
    }
    for (const field of LIFECYCLE) {
        if (!actorText(plan.lifecycle?.[field])) {
            errors.push(`plan.lifecycle.${field} is required`);
        }
    }
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
        errors.push("plan.steps must contain planned lifecycle steps");
        return { errors, warnings, plan };
    }

    for (const step of plan.steps) {
        for (const field of STEP_FIELDS) {
            if (step[field] === undefined || step[field] === "" || (Array.isArray(step[field]) && step[field].length === 0)) {
                errors.push(`plan step ${step.id || "(missing id)"} is missing ${field}`);
            }
        }
    }

    const execution = plan.steps.filter((step) => stepRole(step) === "execution");
    const verification = plan.steps.filter((step) => stepRole(step) === "verification");
    if (!execution.length) {
        errors.push("plan.steps must include an execution step");
    }
    if (!verification.length) {
        errors.push("plan.steps must include a verification step");
    }
    for (const verify of verification) {
        const verifier = actorKey(verify.actor);
        if (execution.some((step) => actorKey(step.actor) === verifier)) {
            errors.push(`verification step ${verify.id} reuses execution actor ${actorText(verify.actor)}`);
        }
    }

    return { errors, warnings, plan };
}

function validateSessionLog() {
    const errors = [];
    const events = readSessions();
    const open = sessionOpenIds(events);
    for (const event of sessionAttachments(events)) {
        if (!event.id || !open.has(event.id)) {
            errors.push(`session attach references missing session: ${event.id || "(missing)"}`);
        }
        if (!event.ticket) {
            errors.push(`session attach in ${event.id || "(missing session)"} is missing ticket`);
        } else if (!ticketExists(event.ticket)) {
            errors.push(`session attach references missing ticket: ${event.ticket}`);
        }
    }
    return errors;
}

function validateTicket(id, { requireProof = false, requireRetro = false } = {}) {
    const errors = [];
    const warnings = [];
    if (!ticketExists(id)) {
        return { id, ok: false, errors: [`no such ticket: ${id}`], warnings };
    }

    const { data, body, journey } = ledger.show(id);
    const planResult = validatePlan(id);
    errors.push(...planResult.errors.map((message) => `${id}: ${message}`));
    warnings.push(...planResult.warnings.map((message) => `${id}: ${message}`));

    if (!attachedSessionsForTicket(id).length) {
        errors.push(`${id}: ticket is not attached to a valid session`);
    }

    const kids = ledger.children(id);
    const criteria = criteriaCount(body);

    // Open-work advisories: scope that demands a split, and silence - an open
    // ticket whose journey has stopped while work presumably continues off the
    // record. Warnings, not errors: the hard stop is the verified gate.
    if (!requireProof && !ledger.TERMINAL.includes(data.status)) {
        if (!kids.length && criteria > maxAcceptance()) {
            warnings.push(`${id}: ${criteria} acceptance criteria exceed scope.maxAcceptance (${maxAcceptance()}); split the deliverables (hos ticket split ${id} "<deliverable>")`);
        }
        const staleMinutes = settings().budget?.staleMinutes ?? 45;
        const lastEvent = journey.at(-1)?.ts;
        if (staleMinutes >= 0 && lastEvent && Date.now() - new Date(lastEvent).getTime() > staleMinutes * 60000) {
            warnings.push(`${id}: no recorded work for over ${staleMinutes}m while open - capture it (hos run ${id} -- <cmd>, hos ticket log) or park the ticket`);
        }
    }

    if (requireProof) {
        // The latest verification outcome decides: a fail recorded after an
        // earlier pass means the ticket is not currently verified.
        const verifications = journey.filter((event) => event.kind === "verify");
        const lastVerify = verifications.at(-1);
        if (lastVerify?.ref !== "pass") {
            errors.push(`${id}: verified closure requires a verify pass as the latest verification event`);
        }
        // A parent ticket closes through its children: every child terminal,
        // and the children's own verified gates carried the proof. A childless
        // ticket carries its own proof - and a compound one must split first.
        const openKids = kids.filter((kid) => !ledger.TERMINAL.includes(kid.status));
        if (openKids.length) {
            errors.push(`${id}: a parent closes only after its children are terminal; still open: ${openKids.map((kid) => kid.id).join(", ")}`);
        }
        const successfulRuns = ledger.runs(id).filter((run) => run.exit === 0).length;
        if (!kids.length && !successfulRuns && evidenceCount(id) === 0) {
            errors.push(`${id}: verified closure requires captured proof through hos run or evidence files`);
        }
        // The split requirement binds plans made under contract v2; work already
        // verified under an older contract is not retroactively reopened.
        if (!kids.length && criteria > maxAcceptance() && (planResult.plan?.contract ?? 1) >= 2) {
            errors.push(`${id}: ${criteria} acceptance criteria exceed scope.maxAcceptance (${maxAcceptance()}) for one ticket; split it first (hos ticket split ${id} "<deliverable>") so each deliverable gets its own plan, proof, and verification`);
        }

        // Contract v2 (plans written by `workflow plan`): the separation must be
        // real in the recorded events, not only declared in the plan. The verify
        // event names the planned verifier, runs outside every work session, and
        // both lifecycle actors were actually composed or dispatched. Legacy
        // plans keep the original gate.
        const plan = planResult.plan;
        if ((plan?.contract ?? 1) >= 2 && plan.lifecycle) {
            const verifierKey = actorKey(plan.lifecycle.verification);
            if (lastVerify) {
                if (actorKey(lastVerify.actor) !== verifierKey) {
                    errors.push(`${id}: the latest verify event actor (${lastVerify.actor || "(none)"}) is not the plan's verification actor (${actorText(plan.lifecycle.verification)})`);
                }
                const workSessions = new Set(
                    sessionAttachments().filter((event) => event.ticket === id && event.reason !== "verify").map((event) => event.id)
                );
                if (!lastVerify.session) {
                    errors.push(`${id}: verification must run inside an open session (hos session open "Verify ${id}" first)`);
                } else if (workSessions.has(lastVerify.session)) {
                    errors.push(`${id}: verification ran in work session ${lastVerify.session}; open a fresh session or dispatch a verification sub-agent`);
                }
            }
            const composedKeys = new Set(
                journey.filter((event) => event.kind === "compose").map((event) => actorKey(event.actor))
            );
            // A parent's execution happened inside its children (each with its
            // own composed actor), so only the integration verifier must have
            // been composed here.
            const roles = kids.length
                ? [["verification", plan.lifecycle.verification]]
                : [["execution", plan.lifecycle.execution], ["verification", plan.lifecycle.verification]];
            for (const [role, actor] of roles) {
                if (!composedKeys.has(actorKey(actor))) {
                    errors.push(`${id}: the ${role} actor ${actorText(actor)} was never composed or dispatched (hos compose ${actorText(actor)} --ticket ${id}, or hos dispatch ${id} --lenses ${actorText(actor)})`);
                }
            }
        }
    }

    if (requireRetro && data.status === "verified" && !journey.some((event) => event.kind === "retro")) {
        errors.push(`${id}: verified non-trivial ticket is missing retrospective accounting`);
    }

    return { id, ok: errors.length === 0, errors, warnings };
}

export function start({ request = "", title = "", report = "", acceptance = "", actor = "alpha", level = "medium", ticket = "" } = {}) {
    const text = request.trim();
    if (!text) {
        throw new Error("workflow start needs a request");
    }
    // With --ticket, the request is new work on a ticket that already owns it:
    // attach instead of creating a duplicate (Inter dedupes before creating).
    // Only an open ticket can own new work; closed work gets a fresh ticket.
    if (ticket) {
        if (!ticketExists(ticket)) {
            throw new Error(`no such ticket: ${ticket}`);
        }
        const status = ledger.show(ticket).data.status;
        if (ledger.TERMINAL.includes(status)) {
            throw new Error(`ticket ${ticket} is terminal (${status}); create a new ticket and relate it with hos ticket link --parent ${ticket}`);
        }
    }
    const sessionId = session.open(text);
    // Captured before any create so the list is the dedupe view Inter saw: open
    // tickets that lexically own parts of this request.
    const similar = ledger.find(text);
    const ticketId = ticket || ledger.create({
        title: title || text,
        report: report || text,
        acceptance,
        actor,
        level
    }).id;
    session.attach(sessionId, { ticket: ticketId, reason: "task" });

    const result = {
        session: sessionId,
        ticket: ticketId,
        created: !ticket,
        similar: similar.filter((t) => t.id !== ticketId),
        memory: memory.search(text).map(({ id, kind, title: t, scope }) => ({ id, kind, title: t, scope })),
        tasks: task.match(text),
        next: `Alpha: hos workflow plan ${ticketId} --execute <lenses> --verify <lenses> --acceptance "..." --evidence "..."`
    };
    // Harness records keep the harness language (doc/protocol/language.md). A
    // non-ASCII title usually means the user's words landed verbatim; point at
    // the rename so the ledger stays readable to every later agent.
    if (!ticket && /[^\x20-\x7E]/.test(title || text)) {
        result.hint = `the ticket title was stored verbatim; if that is not the harness language, rename it with hos ticket title ${ticketId} "<harness-language title>" (or pass --title at start)`;
    }
    return result;
}

export function plan(id, {
    execute = "",
    verify = "",
    level = "",
    intent = "",
    acceptance = "",
    evidence = "",
    onFail = ""
} = {}) {
    if (!ticketExists(id)) {
        throw new Error(`no such ticket: ${id}`);
    }
    if (!execute) {
        throw new Error("workflow plan needs --execute <lenses>");
    }
    if (!verify) {
        throw new Error("workflow plan needs --verify <lenses>");
    }
    if (actorKey(execute) === actorKey(verify)) {
        throw new Error("workflow plan needs different execute and verify actors");
    }

    const { data, body } = ledger.show(id);
    const lvl = level || data.level || "medium";
    const acc = acceptance || section(body, "Acceptance") || "Acceptance must be verified against the ticket.";
    const proof = evidence || "Captured command output or evidence files matched to acceptance.";
    const workIntent = intent || section(body, "Report") || data.title;
    const failPath = onFail || "Return to the execution step with concrete findings.";
    const planned = {
        ticket: id,
        // Contract v2: the verified gate checks the recorded events (composed
        // actors, verifier identity, fresh verification session), not only the
        // declared plan. See validateTicket.
        contract: 2,
        lifecycle: {
            intake: "inter",
            planning: "alpha",
            execution: execute,
            verification: verify,
            closure: "alpha",
            retrospective: "optimizer+curator"
        },
        steps: [
            {
                id: "s1",
                role: "execution",
                intent: workIntent,
                actor: execute,
                level: lvl,
                inputs: [id],
                acceptance: acc,
                evidence: proof,
                onFail: failPath
            },
            {
                id: "s2",
                role: "verification",
                intent: `Verify ${workIntent}`,
                actor: verify,
                level: lvl,
                inputs: ["s1", id],
                acceptance: acc,
                evidence: proof,
                onFail: "Move the ticket back to reproduced and return to the execution step with the failing claim."
            }
        ]
    };

    writeFileAtomic(join(ticketDir(id), "plan.json"), JSON.stringify(planned, null, 2) + "\n");
    ledger.setLevel(id, lvl);
    ledger.log(id, { kind: "plan", summary: `workflow plan: ${execute} -> ${verify}`, by: "alpha" });
    const result = {
        ...planned,
        next: `Execute s1 as ${execute}: hos compose ${execute} --ticket ${id} (or hand a sub-agent the brief from hos dispatch ${id} --lenses ${execute}), capture proof with hos run ${id} -- <cmd>, then hos ticket move ${id} fixed`
    };
    const criteria = criteriaCount(body);
    if (criteria > maxAcceptance() && !ledger.children(id).length) {
        result.hint = `compound acceptance (${criteria} criteria > scope.maxAcceptance ${maxAcceptance()}): split before executing - hos ticket split ${id} "<deliverable>" gives each child its own plan, proof, and verification, and this ticket closes when the children are terminal`;
    }
    return result;
}

export function lint({ ticket = "", all = false, settled = true } = {}) {
    const errors = validateSessionLog();
    const warnings = [];
    // Default lint audits settled (verified) work. --open audits work in
    // flight too - before it, open tickets were skipped entirely, so a bare
    // "lint --open: pass" on a ticketless or pre-verified ledger was vacuous.
    // Terminal non-verified tickets (superseded, duplicate) stay out: they own
    // no work in either mode.
    const ids = ticket
        ? [ticket]
        : ledger.list()
            .filter((item) => all
                || item.status === "verified"
                || (!settled && !ledger.TERMINAL.includes(item.status)))
            .map((item) => item.id);
    const tickets = [];

    for (const id of ids) {
        const status = ticketExists(id) ? ledger.show(id).data.status : "";
        const result = validateTicket(id, {
            requireProof: status === "verified",
            requireRetro: settled
        });
        // In-flight work is advisory: a not-yet-planned ticket is a state, not
        // a defect. The hard stops are ticket move and the verified gate.
        if (!settled && status !== "verified" && result.errors.length) {
            result.warnings.push(...result.errors);
            result.errors = [];
            result.ok = true;
        }
        tickets.push(result);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
    }

    return { ok: errors.length === 0, errors, warnings, tickets };
}

export function assertCanVerify(id) {
    const result = validateTicket(id, { requireProof: true, requireRetro: false });
    if (!result.ok) {
        throw new Error(`workflow gate failed:\n- ${result.errors.join("\n- ")}`);
    }
    return { ok: true, id };
}

export function doctorCheck() {
    const result = lint({ settled: true });
    return {
        ok: result.ok,
        detail: result.errors.slice(0, 5).join(" | ")
    };
}
