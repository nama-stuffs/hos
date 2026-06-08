# Install

Inter runs `node .hos/tools/hos.mjs status` first and follows the reported mode.

## install

Use this for a new or empty project.

1. Ask for the project name, one-line description, runtime, and check commands.
2. Run `hos init --name "<project>" --desc "<description>"`.
3. Record the real runtime and check commands in `.hos/hos.json`.
4. Run `hos accelerators list`; ask before installing any registered accelerator.

`hos init` generates target-local `DESIGN.md`, `CLAUDE.md`, and `.gitignore` when
absent. The spec and memory grow as real work arrives: add a capability spec when
you touch that capability, and a memory entry when the user states a durable choice.

## adopt

Use this when `.hos/` was copied into an existing codebase.

1. Run `hos adopt --name "<detected-or-given name>"`.
2. Detect the runtime and checks from the real project; record them in `.hos/hos.json`.
3. Preserve existing root files.
4. If the host already has `AGENTS.md`, resolve it in the same call with
   `hos adopt --name "<name>" --agents-strategy <append|hos-primary|manual>`.
   Without a strategy, `adopt` reports the merge question under `agents` so you can
   ask the user, then apply it (here or via `hos merge agents`).
5. Run `hos accelerators list`; ask before installing any registered accelerator.

`hos adopt` only adds missing HOS support files. `DESIGN.md` and the spec grow as
you touch code areas; leave them lean until then.

## run

If `status` reports `run`, list open tickets and proceed with
`.hos/persona/inter.md`.

## Verify

```bash
node .hos/tools/hos.mjs doctor    # the project health check
node .hos/tools/hos.mjs status
```

`doctor` is the health check for an installed project. `hos test`, `hos smoke`, and
`hos bench` validate HOS itself and run in the HOS source repo; your project's own
tests run through the commands recorded in `hos.json`.
