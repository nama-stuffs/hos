# Personas

HOS has two control personas and ten composable lenses. See
`.hos/doc/protocol/orchestration.md` for the execution model.

## Control

| Persona | Role |
| ------- | ---- |
| [`inter`](inter.md) | Captures intent as tickets and policy; runs interviews. |
| [`alpha`](alpha.md) | Plans, composes, closes, and triggers the retrospective. |

## Lenses

| Lens | Capability |
| ---- | ---------- |
| [`architect`](architect.md) | Structure, boundaries, extension paths. |
| [`frontend`](frontend.md) | Client surface, state, interaction, accessibility. |
| [`backend`](backend.md) | Data, contracts, invariants, server machinery. |
| [`design`](design.md) | Visual system. |
| [`ux`](ux.md) | Flows, states, interaction, copy. |
| [`ui`](ui.md) | Browser/rendered evidence. |
| [`rev`](rev.md) | Review, impact, and the contribution gate. |
| [`tester`](tester.md) | Suites, scenarios, runtime proof. |
| [`optimizer`](optimizer.md) | Retrospective measurement and harness-improvement proof. |
| [`curator`](curator.md) | Hygiene, deduplication, source of truth. |

Alpha composes lenses per step, for example `architect+backend` for structural
changes, `frontend+ux+design` for a visual build, `rev+tester` for backend
verification, or `optimizer+curator` for the post-close retrospective. If lenses
conflict, the stricter guardrail wins; unresolved conflict goes to Inter.

## Archetypes and realms

Each persona carries an `## Archetype` section: the stance it brings to a
composition and which of four realms it serves. The realms map the whole team:

- **Intent** - capture what is wanted and hold the whole: `inter`, `alpha`.
- **Form** - shape and build what is made: `architect`, `frontend`, `backend`,
  `design`, `ux`.
- **Proof** - establish that what is built is true: `ui`, `rev`, `tester`.
- **Renewal** - keep the system improving and clean: `optimizer`, `curator`.

The archetype is composition guidance, not a separate rule set; the Mission,
Required Reading, and Guardrails still govern the work.
