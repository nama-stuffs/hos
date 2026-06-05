# Retrospective Protocol

Every non-trivial ticket produces a decision about what, if anything, the harness
should learn. The retrospective runs **after closure, asynchronously**, so it
never blocks the user report.

## When

When Alpha moves a ticket to a terminal status, control returns to Inter for the
user report. In parallel, Alpha dispatches a retrospective on a composition it
chooses for that ticket - typically `optimizer+curator`, or a subset (`curator`
for a docs change, `optimizer` for behavior). The retrospective is a claimable,
backgrounded step (`parallel.md`); it does not gate closure.

A ticket is non-trivial - and earns a retrospective - when it changed harness
rules, product behavior, routing, or standards, or when it reopened, blocked, or
produced friction. Trivial tickets skip it.

## Outcomes

The retrospective records one or more outcomes with `hos retro`:

| Outcome | When |
| --- | --- |
| `no-op` | No reusable lesson. The honest default. |
| `memory-policy` | A recurring user preference, decision, or friction. |
| `spec-update` | Product behavior must be made current. |
| `protocol-update` | A workflow or persona rule should change. |
| `bench-scenario` | A regression or past failure worth guarding. |
| `test-tooling` | A cheap, repeatable check worth automating. |
| `follow-up` | Useful work too large or out of scope now; create it per `task.md`. |
| `contribution-candidate` | A harness improvement to propose upstream, only after rev's contribution gate and bench proof. |

This taxonomy is the operational form of the change-placement table in
`session.md`: that table owns the reasoning, this protocol owns the recorded act.

## Proof

- A harness change (`protocol-update`, `bench-scenario`, `test-tooling`,
  `contribution-candidate`) needs a measurable signal: `hos bench --compare` with
  no regression and a retrieval-quality gain, or a scenario guarding a real
  failure. A raw count is not improvement (`bench.md`).
- Delivery metrics (`hos metrics`) describe how a ticket went. They are
  diagnostic and are never an eligibility gate.

## Recording

```bash
hos retro <id> --outcome <a[,b,...]> --by <composition> [--note ..] [--ref ..]
```

This appends a `retro` event to the ticket journey, so `hos metrics` can confirm a
retrospective happened and report its outcomes. Friction graduates into policy
here (`memory.md`), not by every lens writing policy ad hoc. A reusable lesson may
also be consolidated as a `fact` or `episode` (`hos memory add --kind`) - Inter and
Alpha's long-term memory - and a harness change recorded as a `harness-change` entry
so `hos upgrade` can replay the intent (`upgrade.md`).

## Completion bar

A retrospective is complete when its outcome is recorded, any harness change is
proven or owned, and no lesson was invented to look productive.
