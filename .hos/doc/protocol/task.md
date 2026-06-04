# Task Protocol

## Purpose

A task is a tracked unit of work with one source of truth, one current status,
and explicit evidence for completion.

## Where tasks live

Tasks live in the ledger: one directory per ticket under `.hos/tickets/<id>/`,
created and moved with `hos ticket ...`. Each ticket holds:

- `ticket.md` - frontmatter (id, status, `actor`, relations, labels) plus the
  report, acceptance, and element checklist.
- `plan.json` - Alpha's execution plan (`orchestration.md`).
- `journey.ndjson` - append-only trace of every step, decision, and friction; it
  powers `hos ticket report`.
- `evidence/` - logs and screenshots the record references.

## Core rules

- Keep the original report attached. Do not rewrite it into an easier claim.
- Start actionable repository work by finding the related ticket. If none
  exists, create one.
- Define acceptance before treating the task as fixed.
- Close only against evidence, not intent.
- Create follow-up tickets only when they are actionable and useful.

## Status model

| Status | Meaning |
| --- | --- |
| `blocked` | Missing data, access, or a decision; needs an unblocker. |
| `reported` | Request is recorded; reproduction or acceptance is not established yet. |
| `reproduced` | The issue or need is confirmed and acceptance is defined. |
| `fixed` | A change exists, but acceptance has not passed yet. |
| `verified` | Acceptance passed with recorded evidence. |
| `superseded` | A later explicit decision replaced the requirement. |
| `duplicate` | Another ticket owns the work. |

Use `hos ticket move <id> <status>` to transition and log the change.

## Change levels and autonomy

Every non-trivial ticket declares the change **level** it genuinely requires. The
level sets the proof bar and the autonomy needed to proceed.

| Level | User-facing | Scope | Required proof |
| --- | --- | --- | --- |
| L1 | LOW | Clarity, cleanup, naming, micro-edits; no behavior change. | Static check (`node --check`, lint) plus inspection. |
| L2 | MEDIUM | Change a concrete behavior. | A test that fails on the regression. |
| L3 | HIGH | Refactor where parity is not trivially provable. | The refactor parity protocol (`testing.md`) and/or full verification matched to the surface. |

Alpha sets the level at planning: `hos ticket level <id> <low|medium|high>`.

### Classify by need, never to dodge

The level is set by what the change objectively requires: a behavior change is at
least MEDIUM; a non-trivial refactor is HIGH. **Declaring a lower level to avoid
proof or an autonomy escalation is a defect, not a shortcut** - rev fails the
review when the declared level understates the diff. When the task needs an L3
refactor, commit to L3; do not split it into pseudo-L1 edits to slip the gate.

### Autonomy gate

A *granted* autonomy level bounds what may proceed without asking. Granted = an
explicit user grant (recorded by Inter) else `autonomy.default` (`hos.json`,
default MEDIUM).

- `required <= granted`: proceed.
- `required > granted`: Inter asks the user for permission at that level, in their
  language (LOW/MEDIUM/HIGH); on grant, proceed; otherwise narrow scope to fit or
  park.
- A pre-granted HIGH proceeds without further asking.

Check mechanically with `hos autonomy gate <level>`; read or raise the grant with
`hos autonomy show` / `hos autonomy set <level>`. The gate is never bypassed by
down-classifying.

### Budget and parking

Alpha estimates a ticket's effort budget at planning (`hos ticket budget --estimate
<n>`). Observed effort is the recorded actions on the ticket: captured runs plus
work events. When observed reaches `budget.overrunFactor` x estimate (`hos.json`,
default 1.6), the task is too large or unclear - Alpha parks it (`hos ticket
park`), which makes it a `blocked` ticket carrying the `parked` label. Inter then
drives the user's decision (continue, narrow, or stop); the ticket leaves `blocked`
only on that decision. A park is never a silent retry.

## Required ticket content

Each ticket must contain enough information for another agent to continue:

- original report;
- actual or current state;
- expected outcome;
- acceptance criteria;
- evidence required;
- scope and risk notes;
- validation plan;
- relation decisions: duplicate, parent, blocked-by, or blocks.

Keep unknowns explicit. A one-line `unknown` is better than invented detail.

## Work protocol

1. Find or create the tracker issue.
2. Preserve the original report.
3. Confirm current behavior or mark the task `blocked`.
4. Define acceptance and required evidence.
5. Make the smallest change that satisfies acceptance.
6. Move to `fixed` when the change exists.
7. Validate with the agreed evidence.
8. Move to `verified`, or reopen the relevant earlier state with the reason.

If a later explicit instruction conflicts with an older report, the later
instruction wins. Keep the older report attached and mark the losing requirement
as `superseded` where it matters.

## Evidence rules

- UI issues require UI evidence on the reported URL or a documented equivalent.
- Visual claims require visual or browser evidence, not only selector counts.
- Code claims require the relevant static checks, tests, or runtime proof.
- If evidence is weaker than the original report, the issue is not verified.

## Subtasks and relations

- Use the tracker's parent/subtask relation for subtasks.
- Each subtask needs its own acceptance and evidence.
- Use `blocks` for dependencies.
- Use `duplicate` only when another issue owns the same work.

Use `hos ticket link <id> --parent <id>`, `--blocks <id>`,
`--blocked-by <id>`, or `--duplicate-of <id>` to record relations.

## Derived tickets

Create derived tickets only when they prevent repeated waste or own useful work
outside the current scope.

| Type | Create when | Question it answers |
| --- | --- | --- |
| Friction | A delay or workaround is likely to recur. | What should change so this friction does not repeat? |
| Takeaway | A reusable process lesson should update the harness. | What should the harness do differently? |
| Suggestion | An out-of-scope improvement is discovered. | What would improve the product or repository later? |

Do not create placeholder tickets. A derived ticket needs owner or area,
evidence, next action, and a reason it is out of scope.

## Completion bar

A task is complete when its current status is truthful, acceptance is verified or
explicitly not applicable, evidence is attached, and remaining work has an owner.
