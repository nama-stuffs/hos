#!/usr/bin/env node
// HOS control-plane CLI. Dependency-free; runs on Node 18+ or Bun.
//
//   hos status                       # install / adopt / run, and what's open
//   hos version                      # behavior hash (detect mid-session changes)
//   hos doctor                       # self-check
//   hos init  --name <n> [--desc ..] # set up a new project
//   hos adopt --name <n>             # bind to an existing surrounding project
//   hos upgrade --from <path> [--apply]  # re-sync framework files from a newer release
//   hos ticket create "<title>" [--report ..] [--acceptance ..] [--actor frontend+ux]
//   hos ticket list [--claimable] | show <id> | move <id> <status> | link <id> [--parent ..] | report <id> | index
//   hos ticket claim <id> [--by] | release <id> [--stale] | verify <id> --result pass|fail | log <id> --kind .. | thread <id>
//   hos run <id> [--by ..] -- <command>          # capture a command into the ticket deep log
//   hos dispatch <id> [--lenses frontend+ux] [--by ..] # assemble a worker brief (the host spawns; HOS does not)
//   hos retro <id> --outcome <a,b,..> [--by ..] [--note ..]  # record a retrospective decision
//   hos metrics ticket <id> | session [<id>]    # diagnostic delivery metrics from the journey
//   hos spec   add "<title>" [--area ..] | list | criteria | lint | index
//   hos memory search "<text>" [--scope ..] | add "<title>" [..] | friction .. | index
//   hos session open "<request>" | attach <session> <ticket> [--reason ..] | close <session> [--summary ..] | list
//   hos report [<session>] [--format md,html]   # structured session report
//   hos graph impact <file-or-symbol>           # local impact analysis
//   hos accelerators list | plan <id>            # optional opt-in local helpers
//   hos bench [--baseline | --compare]          # effectiveness metrics & deltas
//   hos smoke [--keep]                          # drop-in install/adopt smoke tests
//   hos test                                    # run the unit suite (runner-independent)
//   hos merge agents [--apply <strategy>]       # plan/apply AGENTS.md merge on adoption
//   hos contribute [--title ..]                 # write a contribution bundle
//   hos compose <lens>[+<lens>..] [--policies "<text>"]

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { AGENTS_MD, HOS_DIR } from "./lib/paths.mjs";
import { planAgentsMerge, applyAgentsMerge, STRATEGIES, hosAgentsContent } from "./lib/merge.mjs";
import * as memory from "./lib/memory.mjs";
import * as ledger from "./lib/ledger.mjs";
import * as spec from "./lib/spec.mjs";
import * as session from "./lib/session.mjs";
import { render } from "./lib/report.mjs";
import { ticketMetrics, sessionMetrics } from "./lib/metrics.mjs";
import { impact } from "./lib/graph.mjs";
import { listAccelerators, installPlan } from "./lib/accelerators.mjs";
import { measure, saveBaseline, compare, hasImprovement, hasRegression } from "./lib/bench.mjs";
import { smoke } from "./lib/smoke.mjs";
import { runTests } from "./lib/test.mjs";
import { contribute } from "./lib/contribute.mjs";
import { version } from "./lib/version.mjs";
import { status } from "./lib/status.mjs";
import { doctor } from "./lib/doctor.mjs";
import { upgrade as runUpgrade } from "./lib/upgrade.mjs";
import { patchSettings } from "./lib/config.mjs";
import { detectProjectCommands, ensureGeneratedFiles, isSourceRepo } from "./lib/install-files.mjs";
import { HOS_VERSION } from "./lib/meta.mjs";

const [, , group, ...rest] = process.argv;

function flags(args) {
    const out = { _: [] };
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith("--")) {
            out[args[i].slice(2)] = args[i + 1]?.startsWith("--") || args[i + 1] === undefined ? true : args[++i];
        } else {
            out._.push(args[i]);
        }
    }
    return out;
}

const str = (v, fallback = "") => (v === true || v === undefined ? fallback : v);
const print = (o) => process.stdout.write((typeof o === "string" ? o : JSON.stringify(o, null, 2)) + "\n");
const fail = (m) => {
    process.stderr.write(`hos: ${m}\n`);
    process.exit(1);
};

function setup(a, adopted) {
    const f = flags(a);
    if (!f.name || f.name === true) {
        fail(`${adopted ? "adopt" : "init"} needs --name`);
    }
    if (isSourceRepo() && !f.force) {
        fail(`${adopted ? "adopt" : "init"} refuses to run in the HOS source repo (use --force to override)`);
    }
    const detected = adopted ? detectProjectCommands() : { settings: {}, signals: [] };
    patchSettings({
        hos: { version: HOS_VERSION },
        project: { name: str(f.name), description: str(f.desc), adopted },
        ...detected.settings
    });
    const generated = ensureGeneratedFiles({ projectName: str(f.name), description: str(f.desc), adopted });
    ledger.rebuildIndex();
    spec.rebuildIndex();
    memory.rebuildIndex();
    const out = {
        ok: true,
        project: str(f.name),
        mode: adopted ? "adopt" : "init",
        generated,
        detected: detected.signals,
        next: "hos status"
    };
    if (adopted) {
        out.agents = resolveAdoptMerge(str(f["agents-strategy"], ""));
    }
    print(out);
}

// On adopt, resolve a pre-existing host AGENTS.md in the same call: apply the
// chosen strategy, or surface the merge question when none was given so the
// caller knows the fourth step is still pending.
function resolveAdoptMerge(strategy) {
    const plan = planAgentsMerge();
    if (plan.state !== "has-content") {
        return plan;
    }
    if (!strategy) {
        return { ...plan, hint: "re-run with --agents-strategy <append|hos-primary|manual>, or run `hos merge agents`" };
    }
    if (!Object.prototype.hasOwnProperty.call(STRATEGIES, strategy)) {
        fail(`unknown agents strategy: ${strategy} (one of: ${Object.keys(STRATEGIES).join(", ")})`);
    }
    return applyAgentsMerge({ strategy, hosAgents: hosAgentsContent() });
}

const commands = {
    status: () => print(status()),
    version: () => print(version()),
    doctor: () => {
        const r = doctor();
        print(r);
        process.exit(r.ok ? 0 : 1);
    },
    init: (sub, a) => setup([sub, ...a].filter(Boolean), false),
    adopt: (sub, a) => setup([sub, ...a].filter(Boolean), true),

    upgrade(sub, a) {
        const f = flags([sub, ...a].filter((x) => x !== undefined));
        const r = runUpgrade({ from: str(f.from, ""), apply: Boolean(f.apply), force: Boolean(f.force) });
        print(r);
        process.exit(r.ok ? 0 : 1);
    },

    ticket: {
        create(a) {
            const f = flags(a);
            print(ledger.create({
                title: f._.join(" "),
                report: str(f.report),
                acceptance: str(f.acceptance),
                actor: str(f.actor),
                labels: f.label ? str(f.label).split(",") : []
            }));
        },
        list: (a) => print(flags(a).claimable ? ledger.claimable() : ledger.list()),
        show: (a) => print(ledger.show(flags(a)._[0])),
        claim(a) {
            const f = flags(a);
            const r = ledger.claim(f._[0], str(f.by, "agent"));
            print(r);
            process.exit(r.ok ? 0 : 1);
        },
        release(a) {
            const f = flags(a);
            print(ledger.release(f._[0], { by: str(f.by, "alpha"), stale: Boolean(f.stale) }));
        },
        verify(a) {
            const f = flags(a);
            print(ledger.verify(f._[0], { result: str(f.result, "pass"), note: str(f.note), by: str(f.by, "tester") }));
        },
        log(a) {
            const f = flags(a);
            print(ledger.log(f._[0], { kind: str(f.kind, "note"), summary: str(f.summary), by: str(f.by), ref: str(f.ref) }));
        },
        thread: (a) => print(ledger.thread(flags(a)._[0])),
        move(a) {
            const f = flags(a);
            print(ledger.move(f._[0], f._[1], str(f.note)));
        },
        link(a) {
            const f = flags(a);
            print(ledger.link(f._[0], {
                parent: str(f.parent),
                blocks: str(f.blocks),
                blockedBy: str(f["blocked-by"]),
                duplicateOf: str(f["duplicate-of"])
            }));
        },
        report: (a) => print(ledger.report(flags(a)._[0])),
        index: () => print(ledger.rebuildIndex())
    },

    spec: {
        add(a) {
            const f = flags(a);
            print(spec.add({
                title: f._.join(" "),
                area: str(f.area),
                acceptance: f.acceptance ? str(f.acceptance).split("|") : []
            }));
        },
        list: () => print(spec.list()),
        criteria: () => print(spec.criteria()),
        lint: () => print(spec.lint()),
        index: () => print(spec.rebuildIndex())
    },

    memory: {
        search(a) {
            const f = flags(a);
            const hits = memory.search(f._.join(" "), { scope: str(f.scope, null) });
            print(hits.length
                ? hits.map((p) => ({ id: p.id, title: p.title, scope: p.scope, body: p.body }))
                : "no matching policies");
        },
        add(a) {
            const f = flags(a);
            print(memory.addPolicy({
                title: f._.join(" "),
                body: str(f.body),
                scope: str(f.scope),
                triggers: f.trigger ? str(f.trigger).split(",") : [],
                source: str(f.source, "user")
            }));
        },
        friction(a) {
            const f = flags(a);
            print(memory.addFriction({ title: f._.join(" "), body: str(f.body) }));
        },
        index: () => print(memory.rebuildIndex())
    },

    session: {
        open(a) {
            print(session.open(flags(a)._.join(" ")));
        },
        attach(a) {
            const f = flags(a);
            session.attach(f._[0], { ticket: f._[1], reason: str(f.reason, "task") });
            print({ ok: true, session: f._[0], ticket: f._[1] });
        },
        close(a) {
            const f = flags(a);
            session.close(f._[0], str(f.summary));
            print({ ok: true, closed: f._[0] });
        },
        list: () => print(session.list())
    },

    report(sub, a) {
        const f = flags([sub, ...a].filter((x) => x !== undefined));
        const id = f._[0] && !f._[0].startsWith("--") ? f._[0] : null;
        print(render(id, f.format ? str(f.format).split(",") : undefined));
    },

    graph(sub, a) {
        if (sub !== "impact") {
            fail(`unknown graph command: ${sub}`);
        }
        print(impact(flags(a)._.join(" ")));
    },

    accelerators: {
        list: () => print(listAccelerators()),
        plan(a) {
            print(installPlan(flags(a)._[0]));
        }
    },

    metrics: {
        ticket: (a) => print(ticketMetrics(flags(a)._[0])),
        session(a) {
            const id = flags(a)._[0] || session.latest();
            if (!id) {
                fail("no session to report metrics on");
            }
            print(sessionMetrics(id));
        }
    },

    bench(sub, a) {
        const f = flags([sub, ...a].filter((x) => x !== undefined));
        if (f.baseline) {
            print(saveBaseline());
        } else if (f.compare) {
            const proof = compare(f["baseline-file"] ? { baselineFile: str(f["baseline-file"]) } : undefined);
            print(proof);
            if (f["require-improvement"] && (hasRegression(proof) || !hasImprovement(proof))) {
                process.exit(1);
            }
        } else {
            print(measure());
        }
    },

    smoke(sub, a) {
        const f = flags([sub, ...a].filter((x) => x !== undefined));
        const r = smoke({ keep: Boolean(f.keep) });
        print(r);
        process.exit(r.ok ? 0 : 1);
    },

    test: () => process.exit(runTests()),

    merge(sub, a) {
        const f = flags([sub, ...a].filter((x) => x !== undefined));
        if (sub !== "agents") {
            fail(`unknown merge command: ${sub ?? "(none)"} (try: merge agents)`);
        }
        if (!f.apply) {
            print({ ...planAgentsMerge(), strategies: STRATEGIES });
            return;
        }
        const strategy = str(f.apply, "append");
        if (!Object.prototype.hasOwnProperty.call(STRATEGIES, strategy)) {
            fail(`unknown merge strategy: ${strategy} (one of: ${Object.keys(STRATEGIES).join(", ")})`);
        }
        print(applyAgentsMerge({ strategy, hosAgents: hosAgentsContent() }));
    },

    contribute(sub, a) {
        const f = flags([sub, ...a].filter((x) => x !== undefined));
        print(contribute({ title: str(f.title, "HOS improvement") }));
    },

    retro(sub, a) {
        const f = flags([sub, ...a].filter((x) => x !== undefined));
        print(ledger.retro(f._[0], {
            outcomes: f.outcome ? str(f.outcome).split(",") : [],
            by: str(f.by, "optimizer"),
            note: str(f.note),
            ref: str(f.ref)
        }));
    },

    run(sub, a) {
        const dashdash = a.indexOf("--");
        const cmd = dashdash >= 0 ? a.slice(dashdash + 1) : a;
        if (!sub || !cmd.length) {
            fail("usage: hos run <ticket-id> [--by <agent>] -- <command>");
        }
        const by = str(flags(dashdash >= 0 ? a.slice(0, dashdash) : []).by, "");
        const started = Date.now();
        const proc = spawnSync(cmd.join(" "), { shell: true, encoding: "utf8" });
        const output = (proc.stdout || "") + (proc.stderr || "");
        process.stdout.write(output);
        ledger.recordRun(sub, { cmd: cmd.join(" "), exit: proc.status ?? 0, durationMs: Date.now() - started, output, actor: by });
        process.exit(proc.status ?? 0);
    },

    dispatch(sub, a) {
        const f = flags(a);
        print(dispatchBrief(sub, str(f.lenses, "frontend+backend"), str(f.by, "")));
    },

    compose: (sub, a) => print(composePrompt(sub, str(flags(a).policies)))
};

// Assemble a composed-persona prompt: AGENTS.md + matching policies + each lens
// file (lenses joined by + or ,). The agent reading it executes the step.
function composePrompt(spec, policyText) {
    const lenses = String(spec || "").split(/[+,]/).map((s) => s.trim()).filter(Boolean);
    if (!lenses.length) {
        fail("compose needs at least one lens, e.g. frontend+ux+design");
    }

    const parts = [readFileSync(AGENTS_MD, "utf8")];
    const block = memory.renderPolicyBlock(memory.search(policyText || lenses.join(" ")));
    if (block) {
        parts.push(block);
    }

    for (const lens of lenses) {
        parts.push(readFileSync(join(HOS_DIR, "persona", `${lens}.md`), "utf8"));
    }

    return parts.join("\n\n---\n\n");
}

// Assemble one self-contained worker brief for a ticket: the composed persona, the
// ticket's surface, and the worker contract. The orchestrator hands this to the
// host's sub-agent tool; HOS never spawns. See doc/protocol/parallel.md.
function dispatchBrief(id, lensSpec, by) {
    const lenses = String(lensSpec || "frontend+backend").split(/[+,]/).map((s) => s.trim()).filter(Boolean);
    const persona = composePrompt(lenses.join("+"));
    const { data, body } = ledger.show(id);
    const name = by || `worker-${lenses[0] || "agent"}`;
    const contract = [
        "# Worker contract (.hos/doc/protocol/parallel.md)",
        "",
        `1. Claim it: \`node .hos/tools/hos.mjs ticket claim ${data.id} --by ${name}\`. If the claim fails, take another from \`hos ticket list --claimable\`.`,
        `2. Run every command through \`node .hos/tools/hos.mjs run ${data.id} --by ${name} -- <command>\` so the deep log captures it.`,
        `3. Record decisions and the final handoff: \`node .hos/tools/hos.mjs ticket log ${data.id} --kind note|handoff --summary "..." --by ${name}\`.`,
        `4. Save artifacts under \`.hos/tickets/${data.id}/evidence/\`.`,
        `5. Set status with \`hos ticket move\` / \`hos ticket verify\`. Do not spawn further agents.`
    ].join("\n");
    return [persona, "---", `# Your ticket: ${data.id} - ${data.title}\n\n${body}`, "---", contract].join("\n\n");
}

async function main() {
    const handler = commands[group];
    if (!handler) {
        print("usage: hos <status|doctor|init|adopt|ticket|spec|memory|compose> ...");
        process.exit(group ? 1 : 0);
    }

    if (typeof handler === "function") {
        await handler(rest[0], rest.slice(1));
    } else {
        const sub = handler[rest[0]];
        if (!sub) {
            fail(`unknown ${group} command: ${rest[0] ?? "(none)"}`);
        }
        await sub(rest.slice(1));
    }
}

main().catch((err) => fail(err.message));
