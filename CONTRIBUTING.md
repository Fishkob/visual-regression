# Contributing

Thanks for contributing to the Visual Regression Platform!

## Getting Started

Prerequisites: Docker, Docker Compose, and pnpm (Node >= 24).

```bash
# First-time setup: clean slate → infra (postgres, rustfs) → install deps → generate SDK
./scripts/dev.sh reset

# Start backend + frontend with hot reload (starts infra automatically if needed)
pnpm run dev
```

See [README.md](README.md) and [docs/local-development.md](docs/local-development.md)
for the full reference, including how to seed demo data.

## Before You Write Code

- Read [AGENTS.md](AGENTS.md) for the repository conventions and domain
  language, and [CONTEXT.md](CONTEXT.md) for the shared vocabulary used across
  the codebase.
- Check the sub-`AGENTS.md` files for the workspace you are touching
  (`backend/`, `frontend/`, `client-sdk/`).
- If you are adding or changing API surface, the client SDK is regenerated
  automatically by the pre-commit hook (`scripts/sdk-generate-if-needed.sh`).

## Code Quality Gates

Run these before submitting a change, in this order:

```bash
pnpm run lint              # Backend lint + fix
pnpm run typecheck:all     # Backend + test + frontend type check
pnpm run format            # Format all code
pnpm run unitTest          # Backend unit tests
cd frontend && pnpm test   # Frontend unit tests
```

CI also runs these, plus backend e2e tests (`pnpm run e2eTest`) and frontend
Playwright tests.

## Committing

- Commits are linted, type-checked, and formatted by `lint-staged` on
  pre-commit; the client SDK is regenerated automatically when the OpenAPI
  surface changes.
- Do not commit `client-sdk/*.gen.ts` changes by hand — regenerate them via
  `pnpm run sdk:generate && pnpm run sdk:build` and let the hook stage them.

## Reporting Issues

- **Bugs / feature requests** — open a GitHub issue.
- **Security vulnerabilities** — see [SECURITY.md](SECURITY.md); do not open a
  public issue.
