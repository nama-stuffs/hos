# Audit Protocol

## Purpose

Keep production-facing files audited over time. A file in scope is **born audited**
- it gets a ledger entry when created - and must be **re-audited when its content
changes**. The audit ledger records that a human-or-agent reviewed each file
against `.hos/doc/audit/code.md`, with provenance.

## Scope

Audit covers production code only. Tests, specs, fixtures, mocks, and build or
tooling config are out of scope and are excluded by default
(`*.test.*`, `*.spec.*`, `test/`, `tests/`, `__tests__/`, `__mocks__/`,
`fixtures/`, `*.config.*`), alongside `.git`, `node_modules`, `.hos`, `dist`,
`build`, `coverage`, `vendor`.

A project opts in by listing its production globs in `hos.json`:

```jsonc
"audit": {
  "include": ["src/**/*.js", "lib/**/*.ts"],
  "exclude": ["src/legacy/**"]   // optional, added to the defaults above
}
```

With an empty `include`, `hos audit check` is an advisory no-op, so the harness is
unaffected until a project enables it.

## State

The ledger is `.hos/audit/ledger.json`: one entry per file with a content hash and
provenance. It is committed project state, not a generated index, and `hos
upgrade` never overwrites it.

```jsonc
{ "files": { "src/app.js": { "hash": "<sha256>", "by": "backend", "ticket": "T-..", "date": "YYYY-MM-DD", "note": "" } } }
```

## Commands

```bash
hos audit record <path> [--by <lens>] [--ticket <id>] [--note ..]  # mark audited
hos audit status [<path>]                                          # ledger or one entry
hos audit check                                                    # the gate; non-zero on findings
hos audit prune                                                    # drop entries now out of scope
```

`check` classifies in-scope files: **unaudited** (no entry), **drifted** (content
changed since the recorded hash), and **orphan** (a ledger entry whose file is gone
or out of scope). It exits non-zero when anything is unaudited or drifted.

## Ownership

| Responsibility | Owner |
| --- | --- |
| Author the audit | The implementer (`frontend`/`backend`) records or refreshes the entry when it creates or changes an in-scope file - part of definition-of-done. |
| Gate | `rev` runs `hos audit check`; an unaudited new file or a drifted audited file is a failed review. |
| Hygiene | `curator` runs `hos audit prune` to drop orphan entries. |

The reusable procedure is the `audit` task (`hos task show audit`).

## Completion bar

The audit gate is satisfied when every in-scope file has a current ledger entry
(no unaudited, no drifted), each entry names who audited it, and orphan entries are
pruned.
