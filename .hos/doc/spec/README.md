# Functional Specification

Living product behavior, one capability per file, grouped by area. Governed by
`.hos/doc/protocol/spec.md`.

The source spec starts empty. Agents add or update capability files as they work.
Each capability is defined by its acceptance criteria - atomic, minimal, and
non-redundant - with a short Purpose and a Validation entry per criterion.

- Add a capability: `hos spec add "<title>" --area <area>`
- Collect criteria across areas: `hos spec criteria`
- Flag compound or duplicate criteria: `hos spec lint`
- Generated map: `index.md` (do not edit by hand)
