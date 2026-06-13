# Specification Protocol

The functional spec lives in `.hos/doc/spec/`. It documents what the product does
as **acceptance criteria**: atomic, checkable, behavioural assertions, one
capability per file.

## The reconstruction principle

The spec is the product's durable source of truth; the code is a disposable
projection of it. The bar is concrete: **if every line of code were lost but the
spec survived, an agent could rebuild the application's behaviour from the spec
alone** (runtime data is out of scope - the spec describes the app, not its
accumulated state).

This is what lets HOS *distil* a codebase: point a fresh agent at the spec, have
it rebuild straight-forwardly, and the rebuild carries none of the old code's
detours - a vibe-coded prototype becomes a production-ready app in one pass, often
smaller. For that to work the spec must be **code-free**: it says *what* is
observed, never *how* it is built. The moment a criterion names a file, function,
class, framework, or data store, it steers every future rebuild toward that one
implementation and the distillation is lost.

A capability is reconstruction-ready when all five hold:

1. **Complete** - every user-observable behaviour is a criterion. Nothing the
   product does is left only in the code.
2. **Code-free** - no implementation language: no file, function, class, variable,
   framework, or data-store names, and no "see the code". Externally visible
   formats are stated as observable facts (the bytes a caller sees), not as
   internal schemas.
3. **Unambiguous** - precise enough that two independent rebuilds produce the same
   observable behaviour.
4. **Executably validated** - every capability's Validation names something
   runnable (a test file or a command), so "did the rebuild succeed?" is decidable
   by running it, not by reading prose.
5. **Behaviour, not structure** - criteria fix the *what*, leaving the rebuild free
   to choose a simpler *how*.

## Shape

- One capability per file, grouped by product area, for example `auth/login.md`.
- Scaffold and refresh the index with `hos spec add "<title>" --area <area>`.

Each capability file has exactly three sections - no others, so there is no place
to describe the code:

| Section | Owns |
| ------- | ---- |
| Purpose | Why the capability exists and who relies on it, behaviourally. One or two lines. |
| Acceptance Criteria | The entire specification, as atomic behavioural assertions. |
| Validation | A runnable anchor (test file or command) proving each criterion. |

## Acceptance criteria rules

Criteria are the whole spec, so author them tightly:

- **Atomic.** One assertion per criterion. An "and", a "then", a list - split it.
- **Observable and code-free.** Each criterion passes or fails by a test, command,
  or inspection of what the product *does*. Describe inputs, outputs, state
  transitions, errors, edge cases, and externally visible formats - never the code
  that produces them. `hos spec lint` flags implementation language as a
  `code-leak`.
- **Complete.** Together the criteria cover every observable dimension of the
  capability: the happy path, every state, every error, the edges, and any
  measurable limit. A behaviour that lives only in the code is a missing criterion.
- **Minimal.** The fewest criteria that fully constrain the behaviour. Pull toward
  quality over quantity.
- **Non-redundant.** No criterion restates or is implied by another.
- **Ordered.** Happy path, then states, then errors and edges.

## Validation is executable

Each capability's Validation section names a **test file or a runnable command**,
not a sentence describing a check. This is the anchor a spec-only rebuild runs to
prove it reproduced the behaviour; prose cannot be run, so prose is not validation.

## The gate

- `hos spec lint` reports every issue (`compound`, `duplicate`, `code-leak`,
  `reconstruction`) and a `reconstruction.score`: the fraction of capabilities a
  spec-only rebuild could reproduce.
- `hos spec lint --strict` exits non-zero while any capability is not
  reconstruction-ready - a code leak, an empty Purpose, no criteria, or
  non-executable Validation. Spec work is not done until `--strict` passes.
- `hos spec criteria` collects every criterion across areas for review.

## Coherence

Write the spec as current truth, not history. When behaviour changes, edit the
affected criteria in place; ticket journeys hold history. Cross-link or merge
overlapping capabilities instead of duplicating criteria.

## Grow it as you work

- When a ticket adds or changes behaviour, update the capability's criteria in the
  same step, and keep `hos spec lint --strict` green.
- When adopting a project, write criteria for an area as agents touch it - distil
  the existing behaviour into code-free criteria rather than transcribing the code.
- `tester` and `ui` prove the Validation entries; the `curator` lens keeps the
  criteria atomic, minimal, non-redundant, and code-free. Missing checks are
  ticket gaps.

Alpha only calls this out when the ticket itself is spec work; otherwise the
standing policy applies.

## Relationship to other docs

- `DESIGN.md` owns look and feel.
- `.hos/doc/spec/` owns behaviour as acceptance criteria.
- `.hos/doc/audit/spec.md` owns the reconstruction gate.

## Completion bar

A capability is specified when Purpose is current and behavioural, the criteria are
atomic, minimal, non-redundant, ordered, complete, and code-free, every criterion
has an executable Validation entry, and `hos spec lint --strict` passes.
