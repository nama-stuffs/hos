# Design Audit

Quality gates for visual design. Apply to any visual change. Behavior and flow
rules live in `.hos/doc/audit/ux.md`.

## Gates

- **Tokens, not literals.** Every color, spacing, radius, shadow, type size, and
  duration comes from a `DESIGN.md` token. No one-off hex or pixel magic numbers
  in components.
- **On-scale only.** Spacing, type, and radius stay on the defined scales. Do not
  introduce off-scale values to "make it fit."
- **Palette discipline.** Colors come from the semantic palette tokens; contrast
  meets WCAG AA (see `.hos/doc/audit/ux.md`).
- **Typography.** Families, sizes, weights, and line heights match the type
  scale. No ad-hoc font sizes.
- **Components.** A button, input, or card looks and behaves the same everywhere,
  with all states defined (hover, active, focus-visible, disabled, loading).
  Extend the system rather than forking a component.
- **Iconography & imagery.** Icons and images follow the defined set and style.
- **Motion.** Durations and easing come from the motion tokens; motion is
  functional and respects `prefers-reduced-motion`.
- **Responsive.** Layouts are specified per breakpoint; nothing breaks on small
  screens.

## Checklist

- [ ] No hardcoded colors, spacings, type sizes, radii, or durations.
- [ ] Values stay on the `DESIGN.md` scales.
- [ ] One clear primary action per view; contrast meets AA.
- [ ] Components reuse the system; all states defined.
- [ ] Responsive and reduced-motion behavior specified.
