# Session Protocol

## Purpose

A session is one bounded agent run. It should leave state and evidence clearer
than it found them.

## Start

At the start of a session:

1. Identify the active task and source of truth.
2. Read only the guidance needed for the task.
3. For actionable work, use `hos workflow start` to record Inter intake, matching
   memory, task playbooks, session, ticket, and attachment together.
4. State the intended outcome when the work is non-trivial.
5. Record `hos version` so mid-session harness changes can be detected.

Do not load or restate unrelated policy.

## Live reload

The `hos` CLI re-reads files on every call. Persona text already loaded into an
agent context does not refresh automatically.

Record `hos version` at session start and check it at the top of later turns. If
it changed, re-read the changed files listed by the command before continuing.

## Async control and long work

Inter captures the request with `hos workflow start`, hands the ticket to Alpha,
and returns the ticket list.

Completion is signaled by the report:

- When a request settles, Inter renders the session report (`report.md`).
- `hos workflow lint` keeps verified tickets, session attachments, proof, and
  retrospective accounting checkable.
- `hos status` and `hos ticket list` show live progress.
- HOS has no daemon. Progress requires an agent run or external runner.

## Work loop

Use this loop until the task is done or blocked:

1. Understand the reported need.
2. Challenge one meaningful assumption when the work affects harness, process,
   routing, or standards.
3. Choose the smallest useful change.
4. Edit the owning artifact, not every artifact that mentions the topic.
5. Validate with the lightest evidence that proves the claim.
6. Update task status and follow-ups.

If the challenged assumption fails, convert it into a change, validation gate, or
follow-up.

## Change placement

Classify each change before writing it:

| Class | Location |
| --- | --- |
| Principle | Global guidance. |
| Rule | The local protocol, workflow, file type, or tool where it is used. |
| Validation gate | Test, lint, hook, CI, script, or explicit check. |
| Memory update | Future-useful state, not policy. |
| Routing update | Ownership, escalation, handoff, or task boundary. |
| Follow-up | Valid work too broad or risky for this session. |

Prefer delete, merge, move, or rewrite before adding new guidance.

## Evidence and communication

- Share progress when the session takes multiple steps.
- Mention found defects as soon as they are clear.
- Do not promise background work.
- Do not claim verification without evidence.
- Record uncertainty when evidence is incomplete.

## End

Before ending:

- verify touched paths, links, filenames, and commands;
- run or record the relevant validation;
- update task status truthfully;
- create only necessary derived tickets;
- summarize changed files, evidence, and remaining risk.

A session should end with verified work, a clear blocker, or a scoped follow-up.
