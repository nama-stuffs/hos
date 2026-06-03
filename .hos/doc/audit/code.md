# Code Audit Standard

## Purpose

This standard defines project-independent code quality signals. Project-specific
language or framework gates may add narrower local audit files.

## Audit outcome

For each audited unit, choose one outcome:

- `pass`: no material issue found;
- `fix`: issue is in scope and should be corrected now;
- `move`: rule or code belongs in a different owner;
- `split`: unit has multiple responsibilities;
- `delete`: code is obsolete, unused, or redundant;
- `follow-up`: valid issue is too broad or risky for this task.

## Core quality signals

Pass signals:

- one responsibility per module, class, or function;
- names describe the domain role, not a temporary implementation;
- dependencies are explicit and local to the owning layer;
- control flow has a visible main path;
- side effects happen at named boundaries;
- errors are propagated or handled by contract;
- external inputs are validated at the boundary;
- internal invariants fail loudly instead of being hidden by broad guards;
- public behavior has appropriate tests or documented evidence;
- dead code, debug code, and unused branches are removed.

## Negative patterns to flag

Flag these patterns unless local context proves they are intentional:

| Pattern | Audit signal |
| --- | --- |
| Redundancy | Repeated non-trivial lines, branches, callbacks, payloads, or mappings. |
| Partial redundancy | Same structure repeated with only labels, constants, or messages changed. |
| Oversized function | Function is hard to review, has multiple phases, or exceeds the local limit. |
| Deep branching | Nested decisions hide the main path or duplicate error handling. |
| Mixed responsibility | One unit owns UI, persistence, policy, formatting, and orchestration together. |
| Hidden dependency | Global state, implicit order, service locator, or untracked runtime assumption. |
| Silent failure | Broad catch, swallowed error, fallback without evidence, or nullable result without contract. |
| Defensive internal code | Guards around codebase-owned modules, config, or injected dependencies. |
| Leaky abstraction | Caller must know storage, transport, DOM, or framework details unnecessarily. |
| Unowned behavior | No test, no acceptance evidence, and no clear reason why it is safe. |

## Positive patterns to keep

Keep:

- small cohesive helpers with stable contracts;
- shared logic extracted only after two real uses or a clear domain concept;
- early returns that expose the main path;
- constants for repeated keys, statuses, modes, commands, or limits;
- tests that describe public behavior rather than implementation steps;
- local documentation for non-obvious decisions, tradeoffs, or constraints.

## Size and complexity

When project thresholds are absent, treat these as review triggers:

- a function needs scrolling to understand;
- a function has more than one level of nested branching;
- a file mixes more than one architectural layer;
- a change requires editing the same concept in multiple places;
- a reviewer cannot state the unit's responsibility in one sentence.

Prefer split, rename, move, delete, or extract. Do not abstract one-off
similarity only to satisfy an audit.

## Validation

A code audit is complete when the finding is tied to a concrete location, the
risk is stated, the chosen outcome is recorded, and any fixed code is validated
by the smallest relevant check.
