# HOS Bootstrap

Use this when installing HOS into a target project.

## Copy

Copy `.hos/` into the target project root. That directory is the entire harness.

Do not copy HOS's own repo-level files — they describe HOS itself, not the target
project: `README.md`, `VISION.md`, `LICENSE`, `package.json`, and `.github/`.
`AGENTS.md` is handled under Merge below.

## Merge

- If `AGENTS.md` is absent, copy the HOS one.
- If `AGENTS.md` exists, run `node .hos/tools/hos.mjs merge agents`.
- Apply the chosen strategy with
  `node .hos/tools/hos.mjs merge agents --apply <append|hos-primary|manual>`.
- If `.gitignore` exists, append the HOS local-artifact block when missing.
- If `.gitignore` is absent, create it.

`hos init` / `hos adopt` generate project-local `DESIGN.md` and `CLAUDE.md` when
needed.

## Continue

```bash
node .hos/tools/hos.mjs doctor
node .hos/tools/hos.mjs status
```

Then follow `.hos/install.md`. Delete this file from the installed target when
bootstrap is complete.
