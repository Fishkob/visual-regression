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

## Architecture Decision Records

Decisions live in [`docs/adr/`](docs/adr/README.md). Read the index before
changing an architectural seam — the ADRs explain why the seams are where they
are.

How they are maintained:

- **One decision per ADR.** A second decision gets a new number; an existing
  file is not extended into a multi-part document.
- **`Accepted` is frozen.** Fix typos and broken links; do not rewrite a
  decision, its rationale or its alternatives to match the code as it is today.
- **Supersede, don't overwrite.** When a decision changes, write a new ADR that
  supersedes the old one and set `Superseded by: ADR-NNN` on the old one. Its
  text stays as written.
- **Never delete an ADR.** A superseded ADR records what was believed before,
  and the `ADR-NNN` references in code comments need a target.
- **Divergence is one of three things.** The code has a bug (fix the code, leave
  the ADR alone); the decision changed (new ADR); the wording is wrong (fix the
  wording).
- **Status is a state, not a changelog:** `Accepted — <date>` plus
  `Superseded by: ADR-NNN` where it applies. Date the decision, not the edit.

ADRs written before this rule still carry dated amendment notes and merged
subjects; treat that as history, not as a template. Numbering is append-only
(see the index for the numbers that were consolidated away in the past).

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
