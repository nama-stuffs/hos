---
name: audit
triggers: [audit, reaudit, ledger]
summary: Run the audit gate and bring production files back to audited.
---

# Audit

## Goals

Every in-scope production file is audited and current: no unaudited new files and
no drifted audited files (`.hos/doc/protocol/audit.md`).

## Inputs

- `.hos/doc/protocol/audit.md` - scope, ledger, ownership, the gate.
- `.hos/doc/audit/code.md` - what an audit checks for.

## Steps

1. Run `hos audit check`. If scope is not configured, set `audit.include` in
   `hos.json` to the project's production globs first.
2. For each `unaudited` and `drifted` file, audit it against `code.md` and choose
   an outcome (pass/fix/move/split/delete/follow-up).
3. Fix in-scope issues now or open a follow-up, then mark it audited:
   `hos audit record <path> --by <lens> --ticket <id>`.
4. Run `hos audit prune` to drop orphan entries (deleted or out-of-scope files).
5. Re-run `hos audit check` until it is green.

## Done

`hos audit check` reports no unaudited and no drifted files, each entry names who
audited it, and orphans are pruned.

## Owner

The implementer authors entries; `rev` owns the gate; `curator` prunes orphans.
