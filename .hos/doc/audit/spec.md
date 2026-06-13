# Specification Audit Standard

## Purpose

This standard audits the functional spec (`.hos/doc/spec/`). A capability passes
when the application's behaviour could be rebuilt from it with no access to the
code. It enforces the reconstruction principle in `.hos/doc/protocol/spec.md`.
Every change to a capability follows it.

## Scope

Applies to every file under `.hos/doc/spec/` except `index.md` and `README.md`.
Runtime data and look-and-feel are out of scope (`DESIGN.md` owns the latter).

## Outcomes

For each capability, choose one:

- `pass`: complete, code-free, and executably validated.
- `rewrite`: same capability, restated to remove a code leak or sharpen a vague
  criterion.
- `split`: the file hides more than one capability, or a criterion hides more than
  one assertion.
- `merge`: overlapping capabilities belong in one file.
- `follow-up`: a missing behaviour is real but too broad for the current task.

## Required properties

Each capability must satisfy all five, checked by `hos spec lint --strict`:

- **complete**: every observable behaviour of the capability is a criterion -
  happy path, states, errors, edges, and any measurable limit;
- **code-free**: no file, function, class, variable, framework, or data-store name,
  and no reference to the code; externally visible formats stated as observed
  facts;
- **atomic**: one assertion per criterion;
- **executably validated**: the Validation section names a test file or a runnable
  command, never prose;
- **behavioural**: criteria fix what is observed, leaving the rebuild free to
  choose how.

A capability that cannot meet these is rewritten or split, not accepted.

## The reconstruction test

The objective question: *given only this capability, could an agent rebuild the
behaviour and prove it by running the Validation?* If a criterion needs the code
to be understood, it fails. If the Validation cannot be run, it fails.
`hos spec lint --strict` is the mechanical form; `hos spec reconstruct` (when
present) is the dynamic form - a spec-only rebuild that runs every Validation.

## Negative patterns

| Pattern | Audit signal |
| --- | --- |
| Code leak | Names a file, function, class, framework, or data store (`code-leak`). |
| Transcribed code | Criteria narrate how the code works rather than what is observed. |
| Prose validation | Validation describes a check instead of naming a runnable one. |
| Behaviour only in code | A user-visible behaviour has no criterion (incomplete). |
| Compound criterion | One criterion hides an "and", "then", or a list. |
| Internal schema | States a storage table or column instead of the visible format. |
| Structure lock-in | Fixes a module or layering the rebuild should be free to change. |

## Positive patterns

- One capability per file, one assertion per criterion.
- Criteria a non-programmer could read as product behaviour.
- Externally visible formats stated as the bytes a caller observes.
- A Validation that names the exact test or command to run.

## Completion bar

A spec audit is complete when the capability is complete, code-free, atomic,
behavioural, and executably validated, and `hos spec lint --strict` passes.
