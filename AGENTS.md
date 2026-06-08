# AGENTS.md

HOS is a file-based agent harness under `.hos/`. Any agent that can read files
and run a shell can use it. Start here, then load the persona or composed persona
for the task.

## Flow

```text
User -> Inter -> tickets -> Alpha -> composed lenses -> verified work -> async retrospective
```

- **Inter** is the only persona the user talks to.
- **Alpha** plans, composes, dispatches, closes, and triggers the retrospective.
- **Lenses** (`architect`, `frontend`, `backend`, `design`, `ux`, `ui`, `rev`,
  `tester`, `optimizer`, `curator`) are composed per step.
- Durable rules go to `.hos/memory/`.
- Product behavior goes to `.hos/doc/spec/`.

## Golden Rules

1. Pull matching memory before acting: `hos memory search`.
2. Keep `.hos/doc/spec/` current for touched capabilities.
3. Load only the files needed for the current step.
4. Follow `.hos/doc/protocol/`.
5. Surface reusable decisions and friction for the retrospective.
6. Prefer the smallest correct change; deletion and simplification are wins.
7. When a request matches a task playbook (`hos task match`), load and follow it.
8. Editing a document follows `.hos/doc/audit/doc.md`: plain, positive assertions.

## Personas

| Kind | Persona | Role |
| ---- | ------- | ---- |
| Control | [`inter`](.hos/persona/inter.md) | Onboard, file tickets, run interviews, report. |
| Control | [`alpha`](.hos/persona/alpha.md) | Plan, compose, verify, close. |
| Lens | [`architect`](.hos/persona/architect.md) | Structure and long-term fit. |
| Lens | [`frontend`](.hos/persona/frontend.md) | Client surface and interaction. |
| Lens | [`backend`](.hos/persona/backend.md) | Data, contracts, server machinery. |
| Lens | [`design`](.hos/persona/design.md) | Visual system. |
| Lens | [`ux`](.hos/persona/ux.md) | Flows, states, copy. |
| Lens | [`ui`](.hos/persona/ui.md) | Browser/rendered evidence. |
| Lens | [`rev`](.hos/persona/rev.md) | Review, impact, contribution gate. |
| Lens | [`tester`](.hos/persona/tester.md) | Runtime proof. |
| Lens | [`optimizer`](.hos/persona/optimizer.md) | Retrospective measurement. |
| Lens | [`curator`](.hos/persona/curator.md) | Hygiene and source of truth. |

## Protocols

- [orchestration](.hos/doc/protocol/orchestration.md)
- [memory](.hos/doc/protocol/memory.md)
- [spec](.hos/doc/protocol/spec.md)
- [task](.hos/doc/protocol/task.md)
- [report](.hos/doc/protocol/report.md)
- [session](.hos/doc/protocol/session.md)
- [testing](.hos/doc/protocol/testing.md)
- [bench](.hos/doc/protocol/bench.md)
- [upgrade](.hos/doc/protocol/upgrade.md)
- [parallel](.hos/doc/protocol/parallel.md)
- [retrospective](.hos/doc/protocol/retrospective.md)
- [audit](.hos/doc/protocol/audit.md)
- [language](.hos/doc/protocol/language.md)

Audit gates live in `.hos/doc/audit/`. Optional accelerators live in
`.hos/accelerators/` and are governed by `.hos/doc/accelerators.md`. Harness files
use `language.harness` (English by default); Inter and reports use the user's
language (`language.user`).

## CLI

```text
node .hos/tools/hos.mjs status
node .hos/tools/hos.mjs doctor
node .hos/tools/hos.mjs ticket ...
node .hos/tools/hos.mjs spec ...
node .hos/tools/hos.mjs memory ...
node .hos/tools/hos.mjs session ...
node .hos/tools/hos.mjs report
node .hos/tools/hos.mjs graph impact <target>
node .hos/tools/hos.mjs accelerators list
node .hos/tools/hos.mjs bench --compare
node .hos/tools/hos.mjs smoke
node .hos/tools/hos.mjs test
node .hos/tools/hos.mjs merge agents
node .hos/tools/hos.mjs upgrade --from <path-to-fresh-hos>
node .hos/tools/hos.mjs contribute --title "<title>"
node .hos/tools/hos.mjs compose frontend+ux+design
```

## Setup

On first open, Inter runs:

```bash
node .hos/tools/hos.mjs status
```

Then follow `.hos/install.md` for `install`, `adopt`, or `run`.
