# Documentation Audit Standard

## Purpose

This standard audits Harness Markdown. A document passes when it helps an agent
act correctly with minimal reading. Every change to a document follows it.

## Outcomes

For each document or section, choose one:

- `pass`: accurate, local, and worth keeping.
- `rewrite`: same owner, clearer or shorter.
- `merge`: duplicate content belongs in one source.
- `move`: useful rule lives at the wrong level.
- `delete`: obsolete, unused, unverifiable, redundant, or low-value.
- `follow-up`: valid issue is too broad for the current task.

## Required properties

Each document must make these objective points clear:

- purpose: what decision or work it controls;
- scope: when it applies;
- authority: principle, rule, protocol, audit standard, or example;
- owner: where updates belong;
- action: what the agent must do;
- validation: how compliance is verified;
- handoff: what to record when work cannot finish.

If a document cannot name action and validation, rewrite it or delete it.

## Minimal form

Markdown must be clean:

- Remove sentences that do not change behavior, decisions, or verification.
- Remove filler transitions, apologetic phrasing, and repeated context.
- Prefer one direct sentence over explanatory setup plus conclusion.
- Keep examples only when they prevent a likely mistake.
- Link to the owning document instead of restating its rule.
- Use tables only for mappings, states, owners, or gates.

## Voice

Write plain, direct assertions:

- State the action to take. Reach for a prohibition only when the constraint itself
  is the rule and no positive phrasing reads clearer.
- Use the active voice and name the actor.
- Use plain punctuation: hyphens, not em dashes.
- Vary sentence length, and skip the predictable machine cadence: throat-clearing
  openers, meta-commentary, rule-of-three lists, "not X, but Y" contrasts, and
  one-word dramatic fragments.

## Objective requirements

Documents should require verifiable behavior, not only intent. Replace vague
guidance with:

- command to run;
- file or path to update;
- status transition;
- evidence type;
- owner or role;
- pass/fail condition.

Words such as `clear`, `simple`, `good`, `proper`, or `frictionless` must be
tied to an observable signal.

## Negative patterns

| Pattern | Audit signal |
| --- | --- |
| Essay instead of protocol | Explains intent but does not change agent behavior. |
| Duplicate rule | Same instruction appears in multiple owning documents. |
| Wrong level | Global doc contains local tool, language, or workflow detail. |
| Subjective gate | Uses adjectives without observable criteria. |
| Checklist theater | Adds steps that do not reduce risk or improve execution. |
| Stale reference | Path, command, state, or owner no longer matches the repo. |
| Hidden exception | Mentions a rule but not bypass or escalation. |
| Mixed concerns | Policy, memory, routing, and validation are collapsed together. |
| Redundant wording | A sentence can be deleted without changing action or validation. |
| Correction by negation | States what not to do where a positive instruction reads clearer. |
| Machine cadence | Throat-clearing, meta-commentary, rule-of-three, "not X but Y", dramatic fragments, or em-dash crutch. |

## Positive patterns

- Short sections with one decision per section.
- Tables for state models, mappings, and ownership.
- Examples that remove ambiguity.
- References to the owning document.
- Local rules near the workflow, file type, or tool that uses them.
- Executable gates for objective repeated checks.

## Completion bar

A documentation audit is complete when the document has one owner, no low-value
wording, current references, objective criteria, and a clear validation path.
