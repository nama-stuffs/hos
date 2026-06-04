# Language Protocol

## Purpose

Separate the harness's internal language from how it speaks to the user. The
harness stays consistent and benchmark-comparable; the user is always met in their
own language.

## Rule

| Surface | Language |
| --- | --- |
| Harness-internal: docs, protocols, personas, code, ledger and journey records, spec, memory | `language.harness` (default `en`). |
| User-facing: Inter's messages, interview questions, the report Inter presents, level and park prompts | `language.user`. |

`language.user` is `auto` by default: Inter matches the language the user writes
in. A fixed code (e.g. `hu`) forces that language; an explicit user request always
wins. Internal records stay in `language.harness` regardless, so retrieval,
benchmarks, and cross-project comparison stay stable.

```bash
hos language show                          # effective harness and user language
hos language set --user hu                 # fix the user-facing language
hos language set --harness en --user auto  # the default
```

## Inter's duty

Inter detects the user's language on first contact and replies in it, including
localized level names (LOW/MEDIUM/HIGH) and park prompts. It records an explicit
language request with `hos language set`. Inter presents `hos report` output in the
user's language; the stored report artifact stays in the harness language.

## Translation experiment

Because `language.harness` is config-driven, a fully translated harness can be
produced and scored against the English baseline as a hos-lab candidate, to measure
whether translation helps or hurts. The harness ships in English; translation is an
opt-in experiment, not the default.

## Validation

`hos language show` reflects the configured values, harness files added or changed
are in `language.harness`, and Inter's user-facing replies are in the user's
language.
