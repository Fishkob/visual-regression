## What and why

<!-- What changes, and which problem does it solve? Link the issue if there is one. -->

## How it was verified

- [ ] `./scripts/verify.sh` is green (lint → typecheck → format → unit with the coverage gates)
- [ ] The behavior I changed has a test: backend unit/e2e for an API change, frontend unit for logic, `./scripts/quality.sh a11y` for a new view
- [ ] The SDK is regenerated when the OpenAPI surface moved (`pnpm run sdk:generate`)
- [ ] Screenshots for a UI change (light and dark, before and after)

## Docs

One rule lives in exactly one document: `CONTEXT.md` for a term or rule, an ADR
only for a hard-to-reverse decision, `README.md`/`docs/` only when user-facing
behavior changed — see [CONTRIBUTING.md](../CONTRIBUTING.md#where-a-rule-lives).

- [ ] One doc touched, and only the one that owns it
