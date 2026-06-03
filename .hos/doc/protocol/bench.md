# Benchmark Protocol

HOS changes must be measurable. This protocol answers whether a harness change
helped, hurt, or made no observable difference.

## What is measured

Only runner-independent signals count: no agent identity, network, or wall-clock
time.

| Metric | Meaning | Better |
| ------ | ------- | ------ |
| `policyRecall` | Fraction of expected policies surfaced by `hos memory search`. | higher |
| `policyApplication` | Fraction of expected policies whose rule text reaches the composed prompt. | higher |
| `precision` | Fraction of `reject` checks with no forbidden policy surfacing. | higher |
| `falseSurfaces` | Forbidden policies that surfaced anyway (over-broad triggers). | lower |
| `clarifyingQuestions` | Expected rules not recalled. | lower |
| `specCapabilities` | Documented product capabilities. | higher |
| `docHealthy` | `hos doctor` passes. | true |

`clarifyingQuestions` going down means fewer repeated asks. Recall proves a policy
is *found*; application proves its text is *delivered* to the agent; precision
proves unrelated prompts stay clean.

## Scenarios

Fixtures live in `.hos/doc/bench/scenarios/*.md`. Each has frontmatter:

```md
---
prompt: <something a user might say>
expect: [<policy-id-substring>, ...]
reject: [<policy-id-substring>, ...]
---
Why this matters.
```

`expect` lists policies that must surface for the prompt; `reject` lists policies
that must **not** (a guard against over-broad triggers). Add an `expect` scenario
for a decision that must not be asked again, and a `reject` scenario when a policy
risks leaking into unrelated work.

## Workflow

```bash
hos bench
hos bench --baseline
hos bench --compare
hos bench --compare --baseline-file /path/to/base.json --require-improvement
```

1. Freeze a baseline when HOS is in a known-good state (`--baseline`).
2. After changes to policies, personas, protocols, or tests, run `--compare`.
3. Treat `worse` or regressed `docHealthy` as a blocking signal unless the reason
   is recorded.

## User feedback

Alpha reports meaningful deltas in plain terms. Optimization should be visible,
not silent drift.

## Contribution bundle

`hos contribute --title "..."` writes a bundle under
`.hos/reports/contributions/`. The command must not create branches, push, or
open pull requests.

The bundle must contain:

- Smoke proof.
- Benchmark compare proof.
- Changed HOS files when detection is available.
- A PR body draft.
- A privacy checklist that excludes host project files, secrets, logs,
  screenshots, and ticket evidence.

Upstream work requires user approval. After approval, apply only the declared
HOS scope in a clean upstream workspace, run the test gate, then open a draft
pull request with the generated PR body.

The upstream pull request bar:

- `hos doctor` passes.
- `hos test` passes.
- `hos smoke` passes.
- `hos bench --compare` shows no regression.
- At least one retrieval-quality metric improves (recall, application, precision,
  or fewer false surfaces) or a new scenario is added. A raw capability count
  does not qualify, so a contribution cannot pass by adding a file.
- Upstream CI compares the PR against the base branch baseline with
  `--require-improvement`.

## Completion bar

The benchmark is healthy when a baseline exists, settled decisions have scenarios,
and no change is kept with an unexplained regression.
