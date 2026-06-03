# Install

Inter runs `node .hos/tools/hos.mjs status` first and follows the reported mode.

## install

Use this for a new or empty project.

1. Ask for project name, one-line description, runtime, and check commands.
2. Run `hos init --name "<project>" --desc "<description>"`.
3. Ensure real commands are recorded in `.hos/hos.json`.
4. Add initial spec files with `hos spec add`.
5. Store durable choices with `hos memory add`.
6. Run `hos accelerators list`; ask before installing any registered accelerator.

`hos init` generates target-local `DESIGN.md`, `CLAUDE.md`, and `.gitignore`
when absent.

## adopt

Use this when `.hos/` was copied into an existing codebase.

1. Run `hos adopt --name "<detected-or-given name>"`.
2. Detect runtime and checks from the real project.
3. Preserve existing root files.
4. If the host already has `AGENTS.md`, resolve it in the same call with
   `hos adopt --name "<name>" --agents-strategy <append|hos-primary|manual>`.
   Without a strategy, `adopt` reports the merge question under `agents` so you can
   ask the user, then apply it (here or via `hos merge agents`).
5. Fill `DESIGN.md` and `.hos/doc/spec/` from touched code areas.
6. Run `hos accelerators list`; ask before installing any registered accelerator.

`hos adopt` only adds missing HOS support files.

## run

If `status` reports `run`, list open tickets and proceed with
`.hos/persona/inter.md`.

## Verify

```bash
node .hos/tools/hos.mjs doctor
node .hos/tools/hos.mjs status
node .hos/tools/hos.mjs test
node .hos/tools/hos.mjs smoke
```
