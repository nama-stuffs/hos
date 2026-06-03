# Harness Audit Standard

## Purpose

This standard audits the harness as a system: protocols, prompts, standards,
routing, memory, validation, and agent handoffs.

A harness is effective when it reduces repeated agent failure without creating
unnecessary process cost.

## Audit outcome

For each finding, choose the smallest useful outcome:

- `keep`: current rule is accurate, local, and worth its cost;
- `delete`: rule is obsolete, duplicated, unenforced, or not worth maintaining;
- `merge`: multiple sources should become one source of truth;
- `move`: rule belongs closer to the work that uses it;
- `rewrite`: rule is valid but unclear, vague, or overexplained;
- `strengthen`: risk justifies a stronger rule or validation gate;
- `relax`: rule creates more friction than value;
- `follow-up`: valid improvement is too broad or risky for the current task.

## Challenge pass

Every harness audit must challenge one meaningful assumption, such as:

- this rule still catches a real failure mode;
- this role split still improves outcomes;
- this memory flow still helps later work;
- this validation gate is worth its maintenance cost;
- this document is still the right owner.

Use repository evidence first. If the challenge is valid, make the change or
create a scoped follow-up.

## System criteria

Audit the harness against these criteria:

| Criterion | Pass signal |
| --- | --- |
| Source of truth | Each rule has one durable owner. |
| Locality | Specific rules live near the workflow, tool, file type, or role that uses them. |
| Lifecycle coverage | Task start, execution, validation, handoff, and closure are covered. |
| Lifecycle separation | Intake, planning, execution, verification, closure, and learning owners are named. |
| Evidence | Completion claims require evidence matched to acceptance. |
| Enforcement | Objective repeated rules are automated when cheap enough. |
| Routing | Ownership, escalation, duplicate handling, and blockers are explicit. |
| Memory | Memory stores durable state, not duplicate policy. |
| Change cost | New rules justify context, migration, and maintenance cost. |
| Drift control | Stale paths, commands, states, and references are fixed with the source. |
| Learning loop | Reusable lessons become local rules, validation gates, or follow-ups. |

## Negative system patterns

Flag these patterns:

- global documents become encyclopedias;
- prompts repeat standards instead of linking to the owner;
- policy, memory, routing, and validation are mixed together;
- rules have no trigger, owner, or validation path;
- agents must read many files to do a small task;
- the same step both implements and verifies a non-trivial change;
- tickets close without a retrospective pass for reusable lessons;
- follow-ups lack owner or next action;
- manual checklists replace cheap executable gates;
- executable gates enforce rules no longer used by the repository;
- standards grow after every incident without deleting obsolete guidance.

## Enforcement ladder

Use the lightest mechanism that holds:

1. Delete or merge unnecessary guidance.
2. Move useful local rules to their owner.
3. Rewrite vague rules into observable behavior.
4. Add written protocol where judgment is required.
5. Add executable validation where the rule is objective, repeated, and cheap.

Do not add approvals, roles, memory writes, or gates unless they reduce a real
risk or repeated cost.

## Completion bar

A harness audit is complete when it leaves the system smaller or clearer,
closer to repository reality, less duplicated, and easier for the next agent to
execute correctly.
