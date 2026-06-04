---
name: self-optimization
triggers: [optimize, harness, self, improve, cleanup, stewardship]
summary: Improve the harness itself against the under/over-regulation balance, proving each change.
---

# Self-optimization

## Goals

Leave the harness clearer, leaner, more current, and more enforceable - never
heavier for its own sake. Improve the balance between under-regulation (drift,
skipped rules) and over-regulation (process theater, duplication, friction).

## Inputs

- `.hos/doc/audit/harness.md` - the harness audit standard and its challenge pass.
- `.hos/doc/protocol/retrospective.md` - how a harness change is recorded and proven.
- The ticket journey, `hos metrics`, recall data, and recent friction.

## Steps

1. Run the challenge pass (`harness.md`): pick one harness assumption and try to
   disprove it with repository evidence - duplicated guidance, stale files,
   conflicting rules, dead routing, weak enforcement.
2. Classify each valid issue to the smallest correct change (delete, merge, move,
   rewrite, strengthen, relax) per the enforcement ladder.
3. Apply the change now - this task acts, it does not only recommend. Prefer
   removing or merging over adding.
4. Prove it: `hos bench --compare` with no regression and a retrieval gain, or a
   scenario guarding a real failure. A raw count is not improvement.
5. Record the outcome: `hos retro <id> --outcome protocol-update --by optimizer+curator`.

## Done

The harness is smaller or clearer than found, the change is proven or owned, and no
rule was added that does not reduce a real risk.

## Owner

`optimizer` + `curator`. Commit to an L3 (HIGH) harness change when the structure
requires it; do not down-classify to avoid the proof (`.hos/doc/protocol/task.md`).
