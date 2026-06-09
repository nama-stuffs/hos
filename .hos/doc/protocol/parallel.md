# Parallel Execution Protocol

How one conductor drives many workers over the ledger without collisions. HOS runs
no scheduler and spawns no agents itself; it rides on the host's sub-agent
capability and supplies the coordination and recording the host lacks. Every step
below is a plain `hos` command, so it works the same in Claude Code, Codex,
opencode, or a bare shell.

## Shape: one conductor, leaf workers

Host sub-agents cannot reliably spawn their own sub-agents, so the model is flat,
not a hierarchy:

- **The conductor** is the top-level session - a dual personality. It wears
  **Inter** at the user boundary (capture, report) and **Alpha** at the agent
  boundary (plan, dispatch, integrate, close, trigger the retrospective).
- **Workers** are leaf sub-agents. Each runs a composed persona on a claimed
  ticket and spawns nothing.

For short, interactive work the conductor is one session that switches voice
(synchronous mode). For a **long-running session** the two roles split into two
top-level sessions - a foreground Inter and a background Alpha - coordinating
through the ledger and the inbox (below). Either way the conductor is top level: a
sub-agent Alpha could not launch workers.

## Two layers per ticket

Every ticket carries a terse surface and a full deep log; both are always present.

| Layer | Holds | Read with | Written by |
| --- | --- | --- | --- |
| **Surface** | report, acceptance criteria, decisions, status, handoff | `hos ticket show` | `ticket create/move/link/log`, `ticket verify` |
| **Deep log** | every captured command and its full output | `hos ticket thread` | `hos run` |

The surface stays short, so an agent reads only what matters. The deep log is
captured automatically: workers run commands through `hos run <id> -- <cmd>`, so
output lands in `tickets/<id>/log/` with no one scraping a private agent
transcript (which is vendor-specific and mostly noise). `hos ticket thread` merges
surface, journey, runs, and evidence - this is what the retrospective reads.

## Claim: the per-ticket mutex

`hos ticket claim <id> --by <agent>` creates `claim.json` atomically (the `wx`
flag fails if it exists), so racing workers resolve to one winner.

```bash
hos ticket list --claimable          # open, unblocked, and unclaimed or stale
hos ticket claim <id> --by <agent>   # exits non-zero if already held
hos ticket release <id> [--stale]    # return to the pool; --stale only if aged out
```

A claim older than `parallel.claimTtlMinutes` (default 30) is reclaimable, so a
dead or hung worker never wedges a ticket: the conductor runs
`hos ticket release <id> --stale` and re-dispatches.

## Dispatch

`hos dispatch <id> [--lenses frontend+ux] [--by <name>]` assembles one self-contained
brief: the composed persona, the ticket surface, and the worker contract (claim,
run through `hos run`, log decisions and a handoff, save evidence, move only to
`fixed`, do not spawn). The conductor passes this brief to the host's sub-agent
tool. HOS produces the brief; the host performs the spawn.

## Conductor loop

1. `hos ticket list --claimable` gives the ready set; reclaim stale claims first.
2. For each independent ticket, `hos dispatch` a brief and hand it to a worker -
   in parallel where the host supports background sub-agents.
3. Wait for workers; integrate each handoff, rebuild indexes, run verification as
   a separate step, follow `onFail`, and close through the `hos workflow lint`
   gate.
4. On closure, return control to Inter for the report and dispatch the
   retrospective (`retrospective.md`).
5. Repeat until the ledger is terminal.

## Worker reuse versus fresh workers (cost balance)

A worker spawned per ticket re-pays its briefing each time; a briefed worker kept
alive (continued by the host - for example Claude Code's SendMessage) amortizes
the briefing but carries a growing context. Balance the two:

- **Reuse a briefed worker** for a run of **kin tickets**: same area, same
  persona, where the accumulated context is an asset and no persona switch is
  needed. This is the credit-efficient path for related work.
- **Start fresh** when the next ticket is unrelated, when the persona must change,
  or when the context has grown large enough that briefing a lean worker is
  cheaper than carrying the history.
- Switching persona inside a kept worker is just a new `hos compose <lenses>` (or
  a fresh `hos dispatch`); there is no special mechanism.

Rule of thumb: group by kinship first, cap how many tickets one worker takes, and
restart when the carried context outweighs the briefing a reuse would save.

## Long-running sessions: foreground Inter, background Alpha

A multi-hour run does not keep an agent "awake" burning credits. The two roles
separate:

- **Background Alpha** runs a `wait -> act` loop: `hos wait` blocks until a ledger
  change, an inbox message, or an idle timeout (`wait.timeoutMinutes`, default 30),
  then Alpha integrates, dispatches the next step, and waits again. Between wakes
  the agent does not think, so cost is per wake, not per minute. Alpha checkpoints
  and may restart fresh when its context grows (the reuse-vs-fresh balance applies
  to Alpha itself).
- **Foreground Inter** is on-demand: the user pings ("status?"), Inter reads the
  ledger (`hos status`, `hos ticket list`) and replies in the user's language, then
  is idle - no cost - until the next message. Inter stays read-mostly so it never
  races Alpha.
- **The inbox** (`hos msg send --to alpha`) is the async bus: Inter hands Alpha a
  steering message; Alpha's `hos wait` returns on it and `hos msg drain` reads it.
- **Notifications** fire at hook points - a parked ticket, a settled session, a
  finished run - via `hos notify`, which runs `notify.command` if configured, else
  records to the sink seen on the next ping.

The one piece the harness does not supply is the **runner** that re-invokes
background Alpha across the session. Stated as a capability, not a vendor feature:
the host must be able to run a blocking command, keep a background session alive
across wakes, and spawn workers. Claude Code and Codex satisfy this today; a host
that cannot degrades to synchronous mode.

## Concurrency rules

- **One ticket, one owner.** A worker writes only its claimed ticket's files.
- **Journeys and deep logs are append-only.** No worker rewrites another's record.
- **Indexes are derived and written atomically**; the conductor rebuilds them at
  integration.
- **Implementation and verification are separate steps** (`orchestration.md`).

## Agent-agnostic, with serial degradation

Every step is a `hos` command, so any agent with a shell drives the same flow. The
only host-specific part is the spawn. If the host cannot spawn sub-agents, the
conductor runs the **same loop serially** - claim, work, `hos run`, `hos ticket
log`, fixed, verify, close, next - losing only parallelism, not the record or
correctness.

## Shared worktree, by design

Workers share one worktree. HOS does not isolate them in separate git worktrees;
isolation is **logical** - the claim mutex (one ticket, one owner), append-only
journeys and deep logs, and atomically rebuilt indexes. Independent tickets run in
parallel safely because each worker writes only its own ticket's files. Overlapping
edits to the same files serialize (claim, work, release, next) rather than run in
parallel. Filesystem isolation is a deliberate non-goal: it keeps the model simple
and dependency-free.

## Completion bar

Parallel execution is healthy when every claimed ticket had exactly one owner, no
two workers wrote the same ticket, the deep log and indexes reflect the final
state, stale claims were reclaimed, and verification ran separately from
implementation.
