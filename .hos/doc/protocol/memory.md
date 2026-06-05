# Memory Protocol

The say-once layer. User decisions, corrections, and recurring friction become
policies under `.hos/memory/` and are applied before new work starts.

## Store layout

```text
.hos/memory/
  index.md             # table of all policies
  policy/slug.md       # one durable rule per file
  friction/slug.md     # raw friction logs that may graduate into policy
```

A policy file is frontmatter plus a short body:

```md
---
id: 0007
title: Use snake_case for API fields
scope: code/server
triggers: [api, json, field, naming, response]
status: active
source: user
created: 2026-05-31
---

API response fields use `snake_case`. Applies to every new or changed endpoint.
Rationale: matches the existing public contract.
```

- `scope` routes the policy to the work it governs.
- `triggers` are keywords used to match a policy to a ticket or step. Matching
  also keys on the title's words, so give a policy a specific title; a generic one
  over-matches unrelated work.
- `status` is `active`, `superseded`, or `retired`.

## Memory kinds

The store holds typed entries. `kind` (frontmatter, default `policy`) routes how an
entry is used; all kinds share the retrieval path.

| Kind | Holds | Written by |
| --- | --- | --- |
| `policy` | A durable rule, preference, or correction (say-once). | Inter, retrospective. |
| `fact` | Durable project knowledge (e.g. "auth lives in `src/auth`"). | Inter, Alpha. |
| `episode` | A short summary of a finished session or ticket. | The retrospective, on closure. |
| `harness-change` | The intent behind a harness modification. | The retrospective; replayed on `hos upgrade` (`upgrade.md`). |

Add any kind with `hos memory add "<title>" --kind <kind>`. Facts and episodes give
Inter and Alpha long-term memory beyond rules; `hos memory search --kind` narrows to
one type.

## Namespaces (scope)

`scope` is a namespace path that routes an entry to where it applies:

- empty / `project` - global: applies everywhere.
- `area/<name>` - a product or code area (e.g. `area/auth`).
- `persona/<lens>` - craft knowledge for one lens (e.g. `persona/frontend`).

A composed persona receives its keyword matches **union** the standing memory of
each of its lenses' namespaces - so `compose architect+frontend` sees both
`persona/architect` and `persona/frontend` entries. Global entries always apply.
Keep most memory global; reserve `persona/*` for genuinely craft-specific rules, and
let the curator dedupe across namespaces.

## When to record

Record a policy when a rule becomes reusable:

| Source | Record when | Example |
| ------ | ----------- | ------- |
| `user` | The user states a preference, standard, or correction. | "Always X", "never Y", "I prefer Z". |
| `decision` | An interview resolves a recurring choice. | Stack, naming, or product rule. |
| `friction` | An avoidable delay or repeated mistake appears. | Flaky command, missing step, wrong assumption. |

One rule per file. If a new statement narrows or replaces an old one, mark the
old policy `superseded` and link it.

## How memory is applied

Memory is pulled before acting:

1. Inter loads policies matching the message before filing tickets.
2. Alpha loads policies matching the ticket before planning.
3. Each composed persona receives matching policies in its prompt
   (`orchestration.md`).

Matching uses `scope` and `triggers` against ticket text and step inputs. The CLI
command is `hos memory search`.

## Friction graduation

A friction log is a raw note. When the same friction appears, or one log yields a
clear rule, graduate it into `policy/` and retire the log. The retrospective owns
this graduation (`retrospective.md`); lenses surface friction, they do not each
write policy.

## Relationship to the ledger and spec

- The ledger (`.hos/tickets/`) owns work and status.
- The spec (`.hos/doc/spec/`) owns product behavior.
- Memory owns durable work rules.

The markdown store is the source of truth. Optional accelerators may add indexes,
but policies remain plain files.

## Completion bar

Memory is healthy when every recurring rule has one active policy, no active
policies contradict each other, and matching policies are loaded before work.
