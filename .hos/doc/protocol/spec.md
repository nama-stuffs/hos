# Specification Protocol

The functional spec lives in `.hos/doc/spec/`. It documents what the product does
as **acceptance criteria**: atomic, checkable assertions, one capability per file.

## Shape

- One capability per file, grouped by product area, for example `auth/login.md`.
- Scaffold and refresh the index with `hos spec add "<title>" --area <area>`.

Each capability file has:

| Section | Owns |
| ------- | ---- |
| Purpose | Why the capability exists and who relies on it. One or two lines. |
| Acceptance Criteria | The capability stated as atomic checkable assertions. The primary content. |
| Validation | The check, test, or scenario that proves each criterion. |

## Acceptance criteria rules

Criteria are the heart of the spec, so author them tightly:

- **Atomic.** One assertion per criterion. If a criterion hides more than one
  check - an "and", a "then", a list - split it into separate criteria.
- **Observable.** Each criterion passes or fails by a test, command, or
  inspection, and maps to an entry under Validation.
- **Minimal.** Use the fewest criteria that fully constrain the behavior. If three
  cover what five did, write three. On the quality-versus-quantity axis, always
  pull toward quality.
- **Non-redundant.** No criterion restates or is implied by another.
- **Ordered.** Keep related criteria adjacent, in a natural sequence: happy path,
  then states, then errors and edges.

`hos spec lint` flags likely-compound and duplicate criteria; `hos spec criteria`
collects every criterion across areas for review.

## Coherence

Write the spec as current truth, not history. When behavior changes, edit the
affected criteria in place; ticket journeys hold history. Cross-link or merge
overlapping capabilities instead of duplicating criteria.

## Grow it as you work

- When a ticket adds or changes behavior, update the capability's criteria in the
  same step.
- When adopting a project, write criteria for an area as agents touch it.
- `tester` and `ui` prove the Validation entries; the `curator` lens keeps the
  criteria atomic, minimal, and non-redundant. Missing checks are ticket gaps.

Alpha only calls this out when the ticket itself is spec work; otherwise the
standing policy applies.

## Relationship to other docs

- `DESIGN.md` owns look and feel.
- `.hos/doc/spec/` owns behavior as acceptance criteria.
- `.hos/doc/audit/` owns quality gates.

## Completion bar

A capability is specified when Purpose is current, the acceptance criteria are
atomic, minimal, non-redundant, and ordered, and every criterion has a Validation
entry.
