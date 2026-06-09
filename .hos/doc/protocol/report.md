# Report Protocol

A session report summarizes everything produced by one user request: root
tickets, subtasks, fixes, friction, and follow-ups. It lets the user inspect the
outcome without reading the ledger.

## Session lifecycle

Inter owns the boundary:

1. Open and attach the root task with `hos workflow start "<request>"`.
2. Attach derived tickets with a reason:
   `hos session attach <session> <ticket> --reason <reason>`.
3. Close when the fan-out is done:
   `hos session close <session> --summary "<one paragraph>"`.

Allowed reasons: `task`, `subtask`, `bugfix`, `friction`, `retrospective`.

## The report

`hos report [<session>] [--format md,html]` renders a session, defaulting to the
latest one. Tickets are grouped by reason and include title, status, and evidence
links.

- `md` references screenshots by path.
- `html` inlines screenshots as base64.

Inter offers a report at the end of substantive work and tells the user where it
landed. Before reporting a verified close, Inter runs or checks
`hos workflow lint` so the report does not hide missing proof or retrospective
accounting.

## Screenshots and evidence

User-visible work should leave evidence. The `ui` and `tester` lenses save
screenshots or logs in `.hos/tickets/<id>/evidence/`; reports collect them.
Generated reports live in `.hos/reports/`.

## Completion bar

A turn is well-reported when every produced ticket is attached with the right
reason, the session has a truthful summary, and the report is skimmable.
