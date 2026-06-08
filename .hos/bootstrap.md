# HOS Bootstrap

Use this when adding HOS to a target project by copying its files in.

## Fetch

Clone the HOS repo to a temp folder (skip if you already have a checkout):

```bash
git clone --depth 1 https://github.com/nama-stuffs/hos <tmp>
```

## Copy

Copy `<tmp>/.hos/` into the target project root - that directory is the entire
harness. `AGENTS.md` follows under Merge.

Copy only those two. HOS's repo-level files (`README.md`, `VISION.md`, `LICENSE`,
`package.json`, `.github/`) describe HOS itself and stay in the clone.

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

Then follow `.hos/install.md`. Delete this file from the installed target once
bootstrap is complete.
