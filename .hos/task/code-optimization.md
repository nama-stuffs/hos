---
name: code-optimization
triggers: [optimize, simplify, refactor, complexity, shorten, dead, cleanup, prune]
summary: Shrink and simplify product code toward minimum complexity; unafraid of an L3 refactor under the parity gate.
---

# Code optimization

## Goals

Reduce complexity. Prefer deletion and simplification over addition; a smaller diff
that preserves behavior is the win (`.hos/doc/audit/code.md`, minimum complexity).
Leave the code shorter and built from small, single-purpose modules.

## Inputs

- `.hos/doc/audit/code.md` - minimum complexity, negative patterns, size triggers.
- `.hos/doc/protocol/testing.md` - the refactor parity protocol for risky changes.
- The target module(s) and their current tests.

## Steps

1. Find the simplifiable: redundancy, oversized functions, deep branching, dead
   code, mixed responsibilities, leaky abstractions (`code.md`).
2. Classify the change level honestly (`task.md`): a non-trivial restructuring is
   L3 (HIGH) - do not split it into pseudo-L1 edits to dodge the gate. Escalate to
   Inter when it exceeds the granted autonomy.
3. Prefer delete, merge, split, or extract over adding. Decompose into small
   modules so the whole shortens.
4. For an L3 refactor, prove parity: keep the legacy as reference, build the new
   one alongside, and pass zero-diff comparison tests before the swap
   (`testing.md`).
5. Re-audit any in-scope production file you changed (`hos audit record`).

## Done

The change is a net reduction in size or complexity, behavior is preserved with
proof, and the declared level matches the diff.

## Owner

`architect` plans the structure; the build lens (`frontend`/`backend`) implements;
`rev` + `tester` verify (parity for L3).
