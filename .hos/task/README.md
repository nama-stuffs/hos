# Task Playbooks

Keyword-activated, reusable procedures. When a request matches a playbook's
triggers (`hos task match "<request>"`), load and follow it. Each playbook is a
plain markdown file an agent reads and executes with the `hos` CLI - agent-agnostic
by design.

```bash
hos task list                      # playbooks and their triggers
hos task match "optimize the code" # ranked playbooks for a request
hos task show <name>               # print one playbook
```

## Shipped playbooks

| Name | Triggers on | Does |
| --- | --- | --- |
| `self-optimization` | optimize/improve the harness, cleanup | Improve the harness against the under/over-regulation balance, proving each change. |
| `code-optimization` | optimize, simplify, refactor, reduce complexity | Shrink and simplify product code; unafraid of an L3 refactor under the parity gate. |
| `audit` | audit, re-audit | Run the audit gate and bring production files back to audited. |

## Format

Frontmatter `name`, `triggers` (words), `summary`; then `## Goals`, `## Inputs`,
`## Steps`, `## Done`, `## Owner`. A project may add its own playbooks here; `hos
upgrade` ships the framework ones and never deletes a project's.

Scratch and evidence do not live here - per-ticket evidence lives under
`.hos/tickets/<id>/evidence/`.
