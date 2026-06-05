# Upgrade Protocol

How a project running HOS vN adopts a newer release without losing its own work -
including its own modifications to framework files. A shared, evolving harness is
only useful if installed projects can move forward safely; this protocol owns that
move.

## Principle

The harness splits into two halves with different owners:

| Ownership | Paths | On upgrade |
| --------- | ----- | ---------- |
| **Framework** | `persona/`, `doc/protocol/`, `doc/audit/`, `doc/accelerators.md`, `task/`, `tools/`, `bootstrap.md`, `install.md`, per-directory `README.md` files | three-way merged from the new release |
| **Project** | `hos.json` values, `tickets/`, `memory/`, `doc/spec/`, `doc/bench/`, `accelerators/registry.json`, `DESIGN.md`, generated `index.md` files, `reports/` | preserved untouched |

The version a project last synced to is recorded in `hos.json` under `hos.version`
and stamped on `init`, `adopt`, and a clean `upgrade`. The shipped framework
version lives in `.hos/tools/lib/meta.mjs`.

## Baseline (merge base and recovery)

`init`, `adopt`, and every clean upgrade capture a pristine snapshot of the
framework files into the gitignored `.hos/.baseline/synced/`. This is the **merge
base**: comparing the live files to it reveals the project's own modifications.
Before an `--apply`, the current state is also snapshotted to
`.hos/.baseline/pre-<ts>/`, so the whole step is **reversible even with no git or
uncommitted changes**:

```bash
node .hos/tools/hos.mjs upgrade --restore           # roll back to the latest pre-update snapshot
node .hos/tools/hos.mjs upgrade --restore <label>   # roll back to a named snapshot
```

## Three-way merge

For each framework file the release ships, upgrade compares the live file
(`target`), the new release (`new`), and the base, and classifies it:

| Class | When | On `--apply` |
| --- | --- | --- |
| `add` | missing locally | written from the release |
| `unchanged` | live already equals the release | nothing |
| `overwrite` | live equals the base (you did not modify it), release differs | written from the release |
| `keep-local` | you modified it, the release did not | kept as-is |
| `conflict` | you modified it AND the release modified it | **kept, surfaced for resolution** |
| `review` | no base to compare (a pre-baseline install) | written, captured in the pre-snapshot for rollback |

Safe classes apply automatically. `conflict` files are never silently overwritten:
the upgrade lists them in `conflicts`, lists `keptLocal`, and surfaces every logged
`harness-change` memory in `harnessChangeIntents` so the agent can re-apply the
intent in prose onto the new file. **No modification is forgotten** - every
framework file is classified, and conflicts plus kept-local changes are enumerated.

Resolving a conflict (the agent): read the intent (the `harness-change` memory and
the `pre-<ts>` snapshot for the old content), merge it into the new file by meaning,
then re-run `--apply`. A clean apply (no conflicts) bumps `hos.version` and advances
the base; while conflicts remain, neither happens.

## Checking for a release

```bash
node .hos/tools/hos.mjs upgrade --check [--remote <url-or-path>]
```

`--check` reads the remote framework version (default: this repo's `meta.mjs` on
GitHub, configurable in `hos.json` `upgrade.remote`) and reports whether it is
`newer`. Network happens only when invoked, and an unreachable remote returns
`reachable: false` rather than failing. `upgrade.policy` (`manual` | `offer` |
`auto`) tells Inter whether to offer the upgrade at session start.

## Safety

- **Never deletes.** Project-added audits, personas, and scenarios survive (they
  are absent from the release's framework set).
- **Never touches project state.** Tickets, memory, spec, bench, and `hos.json`
  values are out of scope.
- **Never loses your framework edits.** Local modifications are kept or surfaced as
  conflicts, never silently overwritten; the pre-update snapshot makes any apply
  reversible.
- **Refuses in the HOS source repo** unless `--force`.
- **Re-run the CLI after applying** - the running process holds the old `tools/`
  code; new code loads on the next invocation.
- Line endings are normalized before comparison, so CRLF/LF churn is not a change.

## After upgrade

1. Run `hos doctor` to confirm structure and links.
2. Resolve any `conflict` files, then re-run `--apply`.
3. Run `hos status` and `hos test`.

## Completion bar

An upgrade is complete when safe framework files match the new release, conflicts
are resolved or owned, no project-owned path or local framework edit was lost,
`hos.version` reflects the release, and `doctor` passes.
