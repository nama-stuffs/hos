# HOS — Vision

HOS (Harness Operating System) is a file-based operating layer for coding agents.
You drop `.hos/` and `AGENTS.md` into a project; any agent that can read files and
run a shell then works through a small, dependency-free CLI for tickets, memory,
spec, reports, and proof.

This document explains **why HOS exists, the mental model, how it works today, and
where it is going.** For commands see [README](README.md); for the agent contract
see [AGENTS.md](AGENTS.md).

## The problem

Coding agents are capable but forgetful and inconsistent:

- They re-ask questions the user already answered.
- They lose decisions between sessions and between tools.
- They skip verification and report work as done without evidence.
- Each vendor reinvents its own memory, rules, and workflow.

The intelligence keeps improving. The **operating layer around it** — durable
memory, a work ledger, verification discipline, a living spec — does not come in
the box, and what does exist is locked to one vendor.

## The idea

Put that operating layer in **plain files plus a tiny CLI**, version it like code,
and make it agent-agnostic. The agent supplies intelligence; HOS supplies the
state, the rules, and the proof. Nothing is hidden in a vendor's backend.

Two consequences follow:

1. **Portability.** Claude, Cursor, Codex, or a human can drive the same `.hos/`.
   No daemon, no network, no lock-in. Node 18+ (or Bun) is the only requirement.
2. **Self-improvement.** Because HOS is files measured by its own CLI, a project
   can discover a better rule, prove it with `bench` and `smoke`, and contribute
   it back upstream — so friction in one project makes the shared harness smarter.

## Mental model: the OS analogy

The name is a claim about structure, used honestly:

| OS concept | HOS equivalent |
| --- | --- |
| Processes | Tickets in `.hos/tickets/` — a unit of work with state and a journey. |
| Scheduler | Alpha's conductor loop — pulls ready work, dispatches, integrates. |
| Persistent storage | `.hos/memory/` (say-once rules), `.hos/doc/spec/` (behavior). |
| System calls | Personas — composed per step into the prompt that does the work. |
| Self-test | `doctor`, `test`, `smoke`, `bench` — the harness checks itself. |

It is **cooperative and conductor-led**: one conductor reasons and integrates
while workers fan out in parallel, and progress happens only while agents run —
there is no daemon. That is a deliberate floor, not a limitation to hide — see
*How it works today*.

## The four stores

| Store | Owns | Source of truth |
| --- | --- | --- |
| **Tickets** (`.hos/tickets/`) | Work and status | one directory per ticket, append-only journey |
| **Memory** (`.hos/memory/`) | Durable rules the user stated once | one markdown policy per file |
| **Spec** (`.hos/doc/spec/`) | What the product does, and how to prove it | one capability per file |
| **Reports** (`.hos/reports/`) | What a request produced | generated, disposable |

Each store has one owner and one job; protocols in `.hos/doc/protocol/` define how
they interact.

## The personas

Two control personas and ten lenses — twelve in all:

- **Inter** — the only persona the user talks to. Turns messages into tickets and
  policy; runs interviews; reports outcomes.
- **Alpha** — plans, composes the right lenses per step, verifies on evidence,
  closes, and triggers the retrospective.
- **Lenses** — `architect`, `frontend`, `backend`, `design`, `ux`, `ui`, `rev`,
  `tester`, `optimizer`, `curator`. Each is a focused set of guardrails and
  required reading.

Alpha composes lenses per step (`architect+backend` for structural work,
`frontend+ux+design` for a visual build, `rev+tester` for backend verification,
`optimizer+curator` for the post-close retrospective). The rule that gives HOS
its discipline: **the step that implements a change is never the step that
verifies it.**

Each persona also carries an archetype — a stance and one of four realms
(**Intent**, **Form**, **Proof**, **Renewal**) — as composition guidance, so a
soup of lenses reads as one coherent voice rather than a checklist.

## How it works today

The honest current shape, so expectations are calibrated:

1. A conductor opens the project and reads `AGENTS.md`.
2. It runs `hos status` and onboards (`install`, `adopt`, or `run`).
3. As **Inter** it opens a session, searches memory, and files tickets.
4. As **Alpha** it writes an execution plan: steps, each naming a composed actor
   like `frontend+ux`.
5. For each step it runs `hos compose frontend+ux`, which **concatenates**
   `AGENTS.md`, matching policies, and the named persona files into one prompt.
6. The conductor executes the step itself, or — for independent tickets — fans the
   work out to sub-agent **workers** with `hos dispatch`, each claiming a ticket
   and recording its commands to the ticket's deep log via `hos run`.
7. When the request settles, it renders a session report; the retrospective runs
   after closure.

A "composed persona" is **prompt assembly, not a vendor feature**: the team of
twelve is voices steered by the files just loaded. The CLI never does the work; it
reads and writes files and returns JSON. The intelligence is the agent.

## Where it stands, and where it is going

Most of the original roadmap is now built:

- **Upgrade (`hos upgrade`)** re-syncs framework files to a newer release while
  preserving a project's own tickets, memory, and spec.
- **Frictionless adoption** — one-step `adopt --agents-strategy`, an `npx` entry
  point, and forward-slash paths across platforms.
- **Deeper measurement** — `bench` proves recall, *application* (the rule reaches
  the composed prompt), and *precision* (no junk surfaced), and a raw count can no
  longer game the contribution gate.
- **Multi-agent execution** — the coordination primitives exist: an atomic
  per-ticket **claim**, a **dispatch** brief, a two-layer ticket whose deep log is
  captured automatically by `hos run`, atomic indexes, and a stale-claim TTL. The
  conductor fans independent tickets to host sub-agents; HOS supplies coordination,
  not a runtime (`parallel.md`).

What remains:

- **Field-proven agent-agnosticism** beyond Claude Code — the same flow under
  Codex and other agents, and a published package for `npx`.
- **Write-heavy parallelism** — isolating workers in their own git worktrees when
  they must edit overlapping files, not only append to separate tickets.
- **Self-improvement at scale** — many projects contributing measured upstream
  improvements, so shared friction makes the harness smarter over time.

The order held: portability, upgrade, and self-measurement came first, because a
harness that cannot move forward or prove itself is not worth parallelizing.

## When to use HOS

Use HOS when a project will see **repeated agent work over time** and you want
decisions to stick, work to be tracked, and claims to be backed by evidence —
across whichever agent you happen to use.

It is heavier than a single `CLAUDE.md` instruction file. For a one-off script or
a throwaway prototype, that file is enough. HOS earns its keep when "the agent
forgot," "the agent re-asked," or "the agent said it was done but it wasn't"
start to cost you real time.

## Principles

- **Files over services.** If it matters, it is a file in the repo.
- **Evidence over intent.** A claim without matching proof is not done.
- **Say once.** A decision the user states becomes a policy applied automatically.
- **Smallest change.** Prefer delete, merge, and rewrite over adding guidance.
- **Measure changes to the harness.** Optimization should be visible, not drift.
