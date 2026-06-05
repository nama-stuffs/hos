# Orchestration Protocol

How a user message becomes verified work without the user repeating themselves.
This protocol owns control flow; `task.md` owns ticket state and `memory.md`
owns policy.

## Roles

| Kind | Persona | Responsibility |
| ---- | ------- | -------------- |
| Control | `inter` | Captures requests as tickets and runs interviews. |
| Control | `alpha` | Plans, composes, runs, verifies, and closes. |
| Lens | `architect` | Structural fit, module boundaries, extension paths. |
| Lens | `frontend` | Client surface, state, interaction, accessibility. |
| Lens | `backend` | Data, contracts, invariants, and server machinery. |
| Lens | `design` | Visual system and fidelity to `DESIGN.md`. |
| Lens | `ux` | Flows, states, interaction, copy. |
| Lens | `ui` | Browser/interaction inspection. |
| Lens | `rev` | Code audit, impact analysis, contribution gate. |
| Lens | `tester` | Suites, scenarios, and runtime evidence. |
| Lens | `optimizer` | Retrospective measurement and harness-improvement proof. |
| Lens | `curator` | Hygiene, deduplication, source of truth. |

## Composed personas

Alpha composes the actor for each step from the needed lenses:

- structural change: `architect + backend`;
- visual build: `frontend + ux + design`;
- visual verification: `ui + ux + design`;
- backend fix: `backend`, verified by `rev + tester`;
- docs change: a build lens under the `doc` audit, verified by `rev`;
- retrospective: `optimizer + curator`, dispatched after closure.

A composed prompt is assembled in this order:

1. `AGENTS.md`.
2. Matching memory policies.
3. Relevant protocol slices.
4. Each lens's Mission, Required Reading, and Guardrails.
5. The step contract.

When lenses conflict, the stricter guardrail wins. If they cannot be reconciled,
the step becomes a decision point for Inter.

## Execution plan

For each ticket Alpha writes or refreshes `plan.json`. Each step states intent,
actor, level, inputs, acceptance, evidence, and failure path. The level is the
change level the step requires (`task.md`); when it exceeds the granted autonomy,
Alpha escalates through Inter before running it. Alpha also records an effort
estimate per ticket (`hos ticket budget`); when observed effort crosses the overrun
factor, it parks the ticket for a user decision rather than continuing.

```jsonc
{
  "ticket": "ABC-123",
  "steps": [
    {
      "id": "s1",
      "intent": "Implement the settings panel",
      "actor": { "base": "frontend", "lenses": ["ux", "design"] },
      "level": "medium",
      "inputs": ["DESIGN.md#components", "FR-4"],
      "acceptance": "Panel renders per design; values persist; AA contrast.",
      "evidence": "unit + browser screenshot",
      "onFail": "return to s1 with concrete findings"
    }
  ]
}
```

Independent tickets may run in parallel. Dependent work uses `blocks` relations.

## Lifecycle separation

Every non-trivial ticket must name separate responsibilities:

| Responsibility | Owner |
| --- | --- |
| Intake | Inter captures the request and creates or updates tickets. |
| Planning | Alpha defines work; Architect joins for boundaries or future change cost. |
| Execution | A build lens (`frontend`, `backend`, ...) performs the change. |
| Verification | Rev, Tester, UI, UX, or Design verifies with evidence. |
| Closure | Alpha closes only after matching evidence passes. |
| Retrospective | A composed retrospective lens (Alpha-chosen, e.g. `optimizer + curator`), dispatched after closure; records the decision with `hos retro` (`retrospective.md`). |

The same actor may run multiple steps only when the plan still preserves
executor-verifier separation. A step that implements a change must not be the
step that verifies it.

## Conductor loop

Alpha repeats this loop until the ledger is clean:

1. Pull actionable tickets.
2. Load matching memory.
3. Plan or refresh the execution plan, including lifecycle responsibilities.
4. Dispatch the next ready step with its composed persona.
5. Integrate the result: update status, attach evidence, record reusable
   friction, enqueue Inter for decisions, and follow `onFail` on failure.
6. Verify acceptance with evidence matched to the claim (`testing.md`).
7. After closure, dispatch the retrospective composition asynchronously
   (`retrospective.md`); it does not block the loop.
8. Repeat until every ticket is terminal.

## Agent-agnostic execution

HOS is files plus the `hos` CLI. A step is executed by the agent reading HOS:

- `hos compose <lenses>` produces the composed prompt.
- The step uses local files and `hos` subcommands; no per-agent branch is
  required.
- A long-running session splits Inter (foreground, on-demand) from Alpha
  (background, driven by `hos wait`); see `parallel.md`.

## Completion bar

Orchestration is healthy when the ledger reaches verified terminal state, the
spec reflects the change, decisions and friction become policies, and the work is
reproducible from the plan.
