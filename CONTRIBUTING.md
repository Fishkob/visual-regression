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
- **An ADR says how it is enforced.** Every decision names the thing that keeps
  it true — a config value, a test, a script — or states plainly that nothing
  does. The line belongs in the status block: `Enforced by: <what>` or
  `Not enforced: <why, and what would change that>`. A decision with no
  enforcement hook is a wish, and a wish quoted in review is worse than no ADR.
- **An ADR carries no inventory.** Which tests exist, how many, which thresholds
  are set, which files are excluded: that belongs to the document that owns the
  current state (`docs/testing.md`, the workspace `AGENTS.md`, the config). A
  dated measurement may appear as the evidence a decision was made on ("the gate
  failed at 86.9% on 2026-11-01"); an undated count a reader would take as
  today's does not.
- **When code and an ADR disagree, say which one moves.** Either the code is
  fixed and the ADR stands, or a new ADR supersedes the decision, or the
  deviation is recorded as a named exception in the ADR plus a gap in the owning
  document. Silence is not one of the three.

ADRs written before this rule still carry dated amendment notes and merged
subjects; treat that as history, not as a template. Some also carry counts that
have since drifted — history too, not a licence to add more. Numbering is
append-only (see the index for the numbers that were consolidated away in the
past).

## Where a Rule Lives

A rule is stated in exactly **one** document; everything else links to it.

| Question the document answers                   | Document                           | Updated when                                                     |
| ----------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| What does this term mean, and what is the rule? | [CONTEXT.md](CONTEXT.md)           | A term or a rule changes — always                                |
| Why was this decided, and what was rejected?    | [`docs/adr/`](docs/adr/README.md)  | Never (frozen); a changed decision is a new ADR                  |
| What is planned, in progress or shipped?        | [docs/roadmap.md](docs/roadmap.md) | Status changes; a shipped section is frozen history, not updated |
| How do I run, configure or operate it?          | `README.md`, [`docs/`](docs/)      | Only when user-facing behavior or setup changes                  |

Consequences:

- A change updates **one** document, plus CONTEXT.md when it introduces a term
  or changes a rule. It is not a defect that the README does not explain the
  threshold rule; the README links to it.
- An ADR never becomes the current spec. If an ADR and CONTEXT.md disagree
  about today's behavior, CONTEXT.md is right: either the code has a bug or the
  decision changed (then a new ADR, per the rules above).
- Do not copy a rule into a second document "for convenience". A copied rule is
  a rule that will be wrong in one place.

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
Playwright tests. Both CI workflows start on every pull request and skip the
jobs whose `changes` filter finds the change unrelated; require the
`Backend CI Gate` and `Frontend CI Gate` checks in branch protection, because
those two report on every run.

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
