---
title: Grow the functional spec as you work
scope: spec
status: active
source: decision
triggers: [spec, specification, feature, capability, criteria, document, behavior, acceptance, validation]
created: 2026-05-31
---

When a ticket adds, changes, or uncovers a product capability, update or create
its file under `.hos/doc/spec/` in the same step. In a new project, the touched
spec must stay current from the start. In an adopted project, agents build the
spec continuously from the real code as they touch each area. Define each
capability by atomic, minimal, non-redundant acceptance criteria, each with a
Validation entry; keep them current and never append dated log entries. See
`.hos/doc/protocol/spec.md`.
