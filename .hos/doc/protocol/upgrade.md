# Upgrade Protocol

How a project running HOS vN adopts a newer release without losing its own work.
A shared, evolving harness is only useful if installed projects can move forward
safely; this protocol owns that move.

## Principle

The harness splits into two halves with different owners:

| Ownership | Paths | On upgrade |
| --------- | ----- | ---------- |
| **Framework** | `persona/`, `doc/protocol/`, `doc/audit/`, `doc/accelerators.md`, `tools/`, `bootstrap.md`, `install.md`, and the per-directory `README.md` files | re-synced from the new release |
| **Project** | `hos.json` values, `tickets/`, `memory/policy/`, `memory/friction/`, `doc/spec/`, `doc/bench/`, `accelerators/registry.json`, `DESIGN.md`, generated `index.md` files, `reports/`, `task/` | preserved untouched |

The version a project last synced to is recorded in `hos.json` under `hos.version`
and stamped on `init`, `adopt`, and `upgrade`. The shipped framework version lives
in `.hos/tools/lib/meta.mjs`.

## Command

```bash
node .hos/tools/hos.mjs upgrade --from <path-to-fresh-hos>   # dry-run plan
node .hos/tools/hos.mjs upgrade --from <path-to-fresh-hos> --apply
```

`--from` points at a clean checkout of the new release (a directory containing
`.hos/`). The dry-run reports, per framework file: `add`, `update`, or
`unchanged`, plus the version transition. `--apply` performs the copies and bumps
`hos.json` `hos.version`.

## Safety

- **Never deletes.** Upgrade only adds or overwrites framework files that the new
  release ships. Project-added audit files, custom personas, and extra scenarios
  survive because they are absent from the release's framework set.
- **Never touches project state.** Tickets, memory policies, spec, bench
  baselines, and `hos.json` values are out of scope.
- **Refuses in the HOS source repo** unless `--force` (the source repo is the
  framework, not a target).
- **Re-run the CLI after applying.** The running process keeps the old `tools/`
  code in memory; the new code takes effect on the next invocation.
- Line endings are normalized before comparison, so CRLF/LF churn is not a change.

## After upgrade

1. Run `hos doctor` to confirm structure and links.
2. Run `hos status` and `hos test`.
3. If `doctor` reports new required files, the release added framework structure;
   the upgrade already copied it.

## Completion bar

An upgrade is complete when framework files match the new release, `hos.version`
reflects it, every project-owned path is unchanged, and `doctor` passes.
