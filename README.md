# HOS - Harness Operating System

HOS is a file-based agent harness. Drop `.hos/` and `AGENTS.md` into a project;
agents then use the local `hos` CLI for tickets, an acceptance-criteria spec,
say-once and long-term memory, parallel dispatch, change-level autonomy, a
production audit ledger, task playbooks, background sessions, retrospective
metrics, self-updates, and proof.

New here? Read [VISION.md](VISION.md) for the why, the mental model, how it works
today, and the roadmap.

**Status: beta** - the layout and CLI may change before 1.0. HOS is exercised by
the [HOS Lab](https://github.com/nama-stuffs/hos-lab), a black-box benchmark that
scores install, adopt, upgrade, orchestration, retrieval, memory, autonomy, audit,
tasks, and process efficiency.

Install prompt:

```text
install nama-stuffs/hos in this project
```

An agent following that prompt copies `.hos/` per [.hos/bootstrap.md](.hos/bootstrap.md),
then runs the install / adopt / run flow in [.hos/install.md](.hos/install.md).

For humans, once published to npm:

```bash
npx @nama-stuffs/hos init --name "<project>"    # new project
npx @nama-stuffs/hos adopt --name "<project>"   # existing project
```

## Core

- `AGENTS.md` is the agent entry point.
- `.hos/persona/` holds twelve composable personas across four realms.
- `.hos/doc/protocol/` defines the workflow (orchestration, parallel, spec,
  retrospective, upgrade, ...).
- `.hos/tickets/` is the ticket ledger: a terse surface plus a deep command log.
- `.hos/memory/` stores typed long-term memory: policies, facts, and episodes,
  namespaced by scope (project, `area/<x>`, `persona/<lens>`).
- `.hos/doc/spec/` is the living functional spec, written as acceptance criteria.
- `.hos/task/` holds keyword-activated task playbooks (`hos task match`).
- `.hos/audit/ledger.json` tracks audited production files.
- `.hos/accelerators/registry.json` lists opt-in helpers.

## Requirements

- Node 18+ or Bun.

## Commands

```bash
node .hos/tools/hos.mjs status
node .hos/tools/hos.mjs doctor
node .hos/tools/hos.mjs test
node .hos/tools/hos.mjs smoke
node .hos/tools/hos.mjs bench --compare
node .hos/tools/hos.mjs merge agents
node .hos/tools/hos.mjs upgrade --from <path-to-fresh-hos>
node .hos/tools/hos.mjs compose <lenses>
node .hos/tools/hos.mjs dispatch <ticket-id> --lenses <lenses>
node .hos/tools/hos.mjs retro <ticket-id> --outcome <...>
node .hos/tools/hos.mjs autonomy show
node .hos/tools/hos.mjs ticket level <id> <low|medium|high>
node .hos/tools/hos.mjs ticket budget <id> --estimate <n>
node .hos/tools/hos.mjs ticket park <id> --note "<why>"
node .hos/tools/hos.mjs audit check
node .hos/tools/hos.mjs task match "<request>"
node .hos/tools/hos.mjs language show
node .hos/tools/hos.mjs memory add "<title>" --kind fact --scope area/<x>
node .hos/tools/hos.mjs wait --timeout 30
node .hos/tools/hos.mjs msg send "<text>" --to alpha
node .hos/tools/hos.mjs notify completed --message "<...>"
node .hos/tools/hos.mjs upgrade --check
```

## Test Gate

Run before using this repo as a drop-in source:

```bash
node .hos/tools/hos.mjs doctor
node .hos/tools/hos.mjs test
node .hos/tools/hos.mjs smoke
node .hos/tools/hos.mjs bench --compare
```

## Upstream Improvements

`hos contribute` writes a local contribution bundle. It does not create
branches, push, or open pull requests.

```bash
node .hos/tools/hos.mjs contribute --title "Improve ..."
```

Use the bundle only after user approval. Apply it in a clean upstream workspace,
run the test gate, then open a draft pull request with the generated PR body.
`.github/workflows/hos.yml` re-runs the gate in the upstream repo.

## Layout

```text
AGENTS.md
README.md
VISION.md
LICENSE
.hos/
  accelerators/
  doc/
  memory/
  persona/
  task/
  tickets/
  tools/
  hos.json
  install.md
  bootstrap.md
```

## License

MIT. See [LICENSE](LICENSE).

---

Made with 🤍 in Hungary.
