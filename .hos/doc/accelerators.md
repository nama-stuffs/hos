# Accelerators

Accelerators are opt-in helpers declared in `.hos/accelerators/registry.json`.
HOS core commands must work without them.

## Onboarding

```bash
node .hos/tools/hos.mjs accelerators list
```

If entries exist, Inter asks whether to install any of them. On approval:

```bash
node .hos/tools/hos.mjs accelerators plan <id>
```

Follow the returned install and verify steps. Record only durable user choices as
policy.

## Rules

- No accelerator is required for core HOS.
- Do not install one without user approval.
- Do not add entries that require secrets or hosted services.
- Keep a local fallback for every accelerated capability.

Harness improvements can become upstream contribution bundles with
`hos contribute` after smoke and benchmark proof.
