# UX Audit

Quality gates for the user experience: flows, states, interaction, and copy.
Apply to any user-visible change. Visual-system rules live in
`.hos/doc/audit/design.md`; these gates are about behavior and clarity.

## Gates

- **Every state is designed.** Each view defines its empty, loading, success,
  and error states. No dead ends, no blank screens.
- **Feedback is immediate.** Every action produces visible feedback promptly.
  Long work shows progress, not a frozen UI.
- **Errors are recoverable.** Messages say what happened and what to do next, in
  plain language. Never surface a raw stack trace or a bare error code.
- **Accessible by default.** Interactive elements are keyboard-reachable, have a
  visible focus ring, meet WCAG AA contrast, and are labelled for assistive
  tech. Touch targets are large enough to hit.
- **Consistent patterns.** The same action looks and behaves the same way
  everywhere. Reuse an existing pattern before inventing one.
- **Forgiving input.** Validate early, explain inline, and never lose the user's
  work on error.
- **Plain content.** Copy is concise, jargon-free, and behind i18n keys; it
  never exposes internal names, IDs, or secrets.

## Proof

A change that alters what the user sees or does is user-visible and needs runtime
proof (see `.hos/doc/protocol/testing.md`).

## Checklist

- [ ] Empty, loading, and error states exist and are designed.
- [ ] Every action gives visible feedback.
- [ ] Keyboard-only operation works; focus is visible.
- [ ] Contrast and target sizes meet WCAG AA.
- [ ] Copy is plain, localized, and leaks nothing internal.
