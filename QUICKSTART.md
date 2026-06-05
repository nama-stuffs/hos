# HOS Quickstart

A worked example: drive one real ticket through HOS end to end, then the
longer-running and self-update flows. Every command below is real and runs today
(Node 18+ or Bun). For the why and the mental model, see [VISION.md](VISION.md).

`hos` here is shorthand for `node .hos/tools/hos.mjs`.

## 1. Drop in and onboard

```bash
# In your project root, with .hos/ and AGENTS.md copied in (see .hos/bootstrap.md):
hos adopt --name "<project>"     # existing project  (or: hos init for a new one)
hos status                       # -> mode: run
```

## 2. One ticket, end to end

This is the lifecycle a conductor drives. Inter captures, Alpha plans and verifies,
a composed lens does the work, and the step that implements is never the step that
verifies.

```bash
hos session open "Validate parseConfig input"          # Inter opens a session
hos memory search "validation config parse"            # pull settled rules first

# Inter files the ticket with the original report, acceptance, level, and actor:
hos ticket create "Validate parseConfig input" \
  --report "Throws an ugly error on bad input; should validate and fail clearly." \
  --acceptance "Rejects non-string and malformed JSON with a clear Error; valid JSON still parses." \
  --level medium --actor backend

hos autonomy gate medium          # required <= granted? proceed (else Inter escalates)
hos ticket budget T-... --estimate 5    # Alpha's effort estimate

hos compose backend               # assemble the prompt; the lens implements the change
hos ticket move T-... fixed

# Capture the proof into the ticket's deep log (verification is a separate step):
hos run T-... --by backend -- node --test src/config.test.js
hos ticket verify T-... --result pass --note "3/3 tests green"
hos ticket move T-... verified

hos retro T-... --outcome no-op --by optimizer+curator   # what should the harness learn?
hos session attach S-... T-... && hos report S-... --format md
```

`hos ticket budget T-...` now shows `observed` (recorded runs + work events) versus
the estimate; `hos ticket thread T-...` shows the full deep log.

## 3. Keep production code audited

```bash
# Configure the production globs once (in hos.json: "audit": { "include": [...] }):
hos audit check                   # lists unaudited / drifted in-scope files (tests are out of scope)
hos audit record src/config.js --by backend --ticket T-...
hos audit check                   # green: every in-scope file is audited
```

## 4. Park what is too big

```bash
hos ticket park T-... --note "too large/unclear; needs a user decision"
hos status                        # parked count; Inter surfaces it and drives the decision
```

## 5. Long-running sessions (background Alpha, on-demand Inter)

A multi-hour run does not keep an agent thinking. Background **Alpha** loops
`wait -> act`; foreground **Inter** answers status pings and steers via the inbox.

```bash
# Background Alpha's loop (cost only per wake, not per minute):
while :; do
  hos wait --timeout 30           # blocks until a ticket change, an inbox message, or 30 min
  # ... Alpha integrates the change, dispatches the next ready ticket, then loops ...
done

# You, anytime, steer the background Alpha:
hos msg send "prioritize the parser ticket" --to alpha
# On a milestone Alpha fires a notification (notify.command, or recorded to the sink):
hos notify completed --message "parser ticket verified"
```

## 6. Stay current (self-update with merge)

```bash
hos upgrade --check               # is a newer release on GitHub? (offline-safe)
hos upgrade --from <fresh-checkout>          # dry-run: three-way merge plan
hos upgrade --from <fresh-checkout> --apply  # keeps your local framework edits; surfaces conflicts
hos upgrade --restore             # roll back to the pre-update snapshot (no git needed)
```

## Where next

- [VISION.md](VISION.md) - why HOS exists and how it works.
- `.hos/doc/protocol/` - the workflow protocols (orchestration, parallel, memory,
  upgrade, audit, language, ...).
- `.hos/persona/` - the twelve composable personas.
- [HOS Lab](https://github.com/nama-stuffs/hos-lab) - the scored benchmark.
