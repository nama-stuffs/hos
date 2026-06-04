# Testing Protocol

## Purpose

Testing proves a claim about behavior. Use the lightest reliable evidence that
matches the task acceptance.

## Test selection

Choose tests from the risk outward:

1. Static check for syntax, types, lint, formatting, or policy gates.
2. Unit test for isolated logic and edge cases.
3. Integration test for module boundaries, persistence, API, queues, or jobs.
4. UI or browser proof for visual, interaction, focus, layout, and routing
   claims.
5. Manual evidence only when automation is unavailable or not worth its cost.

Do not test the same claim at every layer unless each layer catches a different
failure mode.

## Evidence rules

- The evidence must match the original acceptance.
- A passing unrelated test does not verify the task.
- UI behavior requires UI evidence.
- Visual behavior requires visual or browser evidence.
- A known failing test must be linked to an owner, blocker, or follow-up.

## Adding tests

Add or update a test when:

- the behavior is public or reused;
- the bug can regress cheaply;
- the code path has meaningful branching or state;
- the task fixes a production defect;
- manual verification would be repeated often.

Do not add brittle tests for incidental implementation details. Prefer public
contracts, stable selectors, stable APIs, and deterministic data.

## Refactor parity

An L3 refactor (`task.md`) must prove it preserved behavior, not assert it.

1. Keep the legacy implementation as the reference; do not edit it yet.
2. Add the new implementation alongside it (a parallel module or a marked
   `*.candidate` name), behind the same inputs.
3. Add comparison tests that feed both the normal, edge, and invalid inputs and
   assert identical output - zero diff.
4. Replace the legacy implementation only when the comparison is green; the swap
   removes the candidate marker and the reference copy in one change.
5. Do not mix unrelated fixes into a parity refactor; behavior changes belong in
   their own L2 ticket.

The green comparison is the L3 proof bar.

## Failing tests

When validation fails:

1. Preserve the failure output or summarize the exact failing claim.
2. Decide whether the failure is caused by the change, the test, environment,
   or existing debt.
3. Fix it in scope, mark the task blocked, or create a follow-up with evidence.

Do not mark a task verified while its acceptance test is failing.

## Completion bar

Testing is complete when the selected evidence proves the acceptance, failures
are resolved or owned, and the task notes explain what was run and what it
proved.

## HOS Repository Smoke Gate

For HOS itself, the drop-in smoke gate is:

```bash
node .hos/tools/hos.mjs doctor
node .hos/tools/hos.mjs test
node .hos/tools/hos.mjs smoke
node .hos/tools/hos.mjs bench --compare
```

The smoke command must prove new-project install, existing-project adopt,
preservation of host root files, generated `DESIGN.md`/`CLAUDE.md`, `.gitignore`
setup, spec creation, ticket/session/report rendering, and post-install
`doctor`.
