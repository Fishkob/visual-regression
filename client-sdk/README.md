# @fishkob/vrt — TypeScript client

Typed TypeScript client for the Visual Regression API. The generated surface
lives in `index.ts`/`sdk.gen.ts`/`models/` (never edit those by hand); this
README covers how the package ships and the two hand-written helpers on top:

| Import                     | Content                                                  |
| -------------------------- | -------------------------------------------------------- |
| `@fishkob/vrt`             | every generated SDK function, DTO type and enum          |
| `@fishkob/vrt/client`      | `createClient` / `createConfig` for a raw configured SDK |
| `@fishkob/vrt/upload-many` | bounded-concurrency batch upload with 429/5xx retries    |
| `@fishkob/vrt/playwright`  | a Playwright reporter that uploads screenshot attachments |

The package has **zero runtime dependencies** (it uses `globalThis.fetch`) and
ships as ESM only; it needs Node 20 or newer.

## Install

The client is not published to npm. It ships as the tarball attached to a
platform release, and its version is the release tag — install the version that
matches your server:

```bash
# private repository: the release asset needs an authenticated download
gh release download v3.4.0 -R Fishkob/visual-regression -p 'fishkob-vrt-*.tgz'
npm i ./fishkob-vrt-3.4.0.tgz   # or: pnpm add ./fishkob-vrt-3.4.0.tgz
```

The `/releases/download/...` URL answers only a browser session for a private
repository, so a shell or pipeline has to go through `gh release download` or the
API asset endpoint (`Accept: application/octet-stream` plus a token). The asset
holds the compiled `dist/` only; the licence at the repository root applies.

## Upload one capture

```ts
import { uploadControllerUpload } from '@fishkob/vrt';
import { createClient, createConfig } from '@fishkob/vrt/client';

const client = createClient(
  createConfig({
    baseUrl: 'https://vrt.example.com/api/v1',
    headers: { 'x-api-key': process.env.VRT_API_KEY! },
  }),
);

await uploadControllerUpload({
  client,
  path: { projectName: 'checkout', testName: 'login' },
  query: { testKind: 'image' },
  body: {
    file: new Blob([pngBytes], { type: 'image/png' }),
    viewport: '1920x1080',
    browser: 'chromium',
    environment: 'staging',
    branch: 'main',
    runKey: process.env.GITHUB_RUN_ID,
  },
});
```

The response is a discriminated union on `status` — `identical`,
`baseline_created` or `comparison_queued` (which carries the `jobId` to poll).
[docs/ci-integration.md](../docs/ci-integration.md) describes the wait/gate flow
those statuses drive.

## `uploadMany` (batch)

```ts
import { uploadMany } from '@fishkob/vrt/upload-many';

const results = await uploadMany(captures, {
  apiKey: process.env.VRT_API_KEY!,
  baseUrl: 'https://vrt.example.com/api/v1',
  concurrency: 4, // default 4, max 16
  maxAttempts: 3, // default 3
  retryDelayMs: 500, // exponential backoff base
  onProgress: (done, total) => console.log(`${done}/${total}`),
});

const failed = results.filter((result) => !result.ok);
```

- Retries only `429`, `5xx` and network errors; honours `Retry-After`.
- Results keep the input order and never reject for a single capture failure.
- A `runKey` on each capture groups the batch into one run.
- `baseUrl` defaults to `http://localhost:3000/api/v1`.

### Config-as-code (`.vrt.json`)

The reporter reads per-test pixel thresholds from `.vrt.json` in the working
directory (override with `configPath`); `uploadMany` callers can set the same
field directly on a capture.

```json
{
  "thresholds": {
    "checkout.spec.ts / cart summary": 12,
    "login works": 4
  }
}
```

- Keys are the reporter's canonical test name (title path joined with `" / "`);
  the bare title and the last path segment are accepted as fallbacks.
- The server applies the value when the upload creates the baseline and can only
  **tighten** an existing baseline. Raising a threshold auto-accepts pending
  comparisons and stays an ADMIN action.
- A missing file means "no thresholds"; a broken file is surfaced through
  `onConfigError`, and the uploads proceed without thresholds.
- `parseVrtConfig`, `thresholdForTest` and `VRT_CONFIG_FILE` are exported from
  `@fishkob/vrt/upload-many` for custom callers.

## Playwright reporter

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    [
      '@fishkob/vrt/playwright',
      {
        apiUrl: 'https://vrt.example.com/api/v1',
        apiKey: process.env.VRT_API_KEY!,
        project: 'checkout',
        runKey: process.env.GITHUB_RUN_ID,
        branch: process.env.GITHUB_HEAD_REF || 'main',
        environment: 'ci',
        uploadOnFailureOnly: false,
      },
    ],
  ],
});
```

The reporter uploads the first `screenshot`/`.png` (or `.pdf`) attachment of
each test. Test names default to the Playwright title path joined with ` / `.
`onEnd()` never fails the test run when VRT is unreachable; inspect
`reporter.results()` or use `onUpload` to log upload failures.

## In this repository

The frontend and the browser suites import the SDK **source** through the `@sdk`
alias (`@sdk`, `@sdk/models/...`), not through the package name — `dist/` is a
build artifact and is not needed for development. `pnpm run sdk:build` produces
it.

## Building and packaging

```bash
pnpm --filter ./client-sdk build   # tsc -p tsconfig.build.json + specifier fix
pnpm --filter ./client-sdk test
pnpm run sdk:pack                  # build, pack, install and verify the tarball
```

`tsc` preserves the extensionless specifiers that `@hey-api/openapi-ts` emits
(`./sdk.gen`, `./client`). Node's ESM resolver infers neither extensions nor a
directory `index.js`, so `scripts/fix-esm-specifiers.mjs` rewrites them in
`dist/` as a build step. `scripts/check-client-sdk-package.sh` proves the result
by installing the packed tarball into an empty project, importing every subpath
in Node ESM and type-checking a consumer under both `nodenext` and `bundler`
resolution; `scripts/verify.sh` runs it and the release workflow reuses it.
