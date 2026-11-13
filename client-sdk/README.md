# @fishkob/vrt — TypeScript client

Typed TypeScript client for the Visual Regression API. The generated surface
lives in `index.ts`/`sdk.gen.ts`/`models/` (never edit those by hand); this
README covers how the package ships and the two hand-written helpers on top:

| Import                     | Content                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `@fishkob/vrt`             | every generated SDK function, DTO type and enum            |
| `@fishkob/vrt/client`      | `createClient` / `createConfig` for a raw configured SDK   |
| `@fishkob/vrt/upload-many` | bounded-concurrency batch upload with 429/5xx retries      |
| `@fishkob/vrt/playwright`  | a Playwright capture API that uploads what a test captures |

The package has **zero runtime dependencies** (it uses `globalThis.fetch`) and
ships as ESM only; it needs Node 20 or newer.

## Install

The client is published to npm as `@fishkob/vrt` and has its own version line,
independent of the platform release. Pin the exact version:

```bash
npm i @fishkob/vrt@1.0.0   # or: pnpm add @fishkob/vrt@1.0.0
```

It speaks `/api/v1`, so it works with any server that serves that API version —
a client release names the client, not the server.

For a setup without registry access, pack the package where the registry is
reachable and carry the tarball over — npm is the artifact store, the release page
carries the notes ([ADR-073](https://github.com/Fishkob/visual-regression/blob/main/docs/adr/ADR-073-release-assets-and-immutable-releases.md)):

```bash
npm pack @fishkob/vrt@1.0.0    # produces fishkob-vrt-1.0.0.tgz
npm i ./fishkob-vrt-1.0.0.tgz
```

Both channels carry the compiled `dist/` and the MIT licence at the repository
root. Decision and rationale:
[ADR-069](https://github.com/Fishkob/visual-regression/blob/main/docs/adr/ADR-069-independent-client-version.md).

## Versioning

The client releases on its own line. A new version appears only when something
in this package changes — in practice a regenerated API surface, so the version
moves when the artifact moves. The compatibility contract is the API version,
`/api/v1`, not the platform version.

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
[docs/ci-integration.md](https://github.com/Fishkob/visual-regression/blob/main/docs/ci-integration.md) describes the wait/gate flow
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

The capture client reads per-test pixel thresholds from `.vrt.json` in the
working directory (override with `configPath`); `uploadMany` callers can set the
same field directly on a capture.

```json
{
  "thresholds": {
    "checkout.spec.ts / cart summary": 12,
    "login works": 4
  }
}
```

- Keys are the client's canonical test name (title path joined with `" / "`);
  the bare title and the last path segment are accepted as fallbacks.
- The server applies the value when the upload creates the baseline and can only
  **tighten** an existing baseline. Raising a threshold auto-accepts pending
  comparisons and stays an ADMIN action.
- A missing file means "no thresholds"; a broken file is surfaced through
  `onConfigError`, and the uploads proceed without thresholds.
- `parseVrtConfig`, `thresholdForTest` and `VRT_CONFIG_FILE` are exported from
  `@fishkob/vrt/upload-many` for custom callers.

## Playwright captures

The client uploads what the test captures — there is no reporter and no
attachment. Create it once next to the tests:

```ts
// tests/vrt.ts
import { createVrt } from '@fishkob/vrt/playwright';

export const vrt = createVrt({
  apiUrl: 'https://vrt.example.com/api/v1',
  apiKey: process.env.VRT_API_KEY!,
  project: 'checkout',
  branch: process.env.CI_BRANCH || 'main',
  viewport: '1920x1080',
  browser: 'chromium',
  environment: 'staging',
  runKey: process.env.CI_RUN_ID, // groups this pipeline's uploads
});
```

and call it in the test:

```ts
import { test } from '@playwright/test';
import { vrt } from './vrt';

test('cart summary', async ({ page }, testInfo) => {
  await page.goto('/cart');
  await vrt.capture(testInfo, page); // full page, uploaded now
});
```

- `capture(testInfo, page)` screenshots the page (`fullPage: true`; pass
  `{ fullPage: false }` for the viewport) and uploads it immediately under the
  test's title path, reduced to the API's name characters:
  `checkout.spec.ts / cart summary` becomes `checkout-spec-ts-cart-summary`, at
  most 100 characters.
- Any bytes work too: `await vrt.capture(testInfo, await page.pdf(), { kind: 'pdf' })`
  for a PDF, or a buffer you produced yourself. A PDF buffer is recognised by
  its `%PDF-` header when `kind` is omitted.
- The first capture of a variant creates the project, the branch and the
  baseline; later captures are compared against it. `viewport`, `browser` and
  `environment` are the Variant and are matched verbatim, case included.
- A failed upload does not fail the test run: `capture` resolves to a
  `CaptureUploadResult` with `ok: false` and `error`, and `onUpload` receives it.
  A page that cannot be screenshotted throws, because that is a test bug rather
  than an upload failure.
- The remaining options (`commitSha`/`commitMessage`/`ciUrl`, `configPath`,
  `maxAttempts`, `onUpload`, `onConfigError`) are documented on `VrtClientOptions`
  in the published types.

### Failure-only

Call the client from an `afterEach` and skip the tests that ended as expected:

```ts
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  await vrt.capture(testInfo, page);
});
```

### Turning it off

The `capture` call is the switch: leave it out for a single test, or make the
client conditional so a pipeline without the key sends nothing and the tests can
keep calling `vrt?.capture(testInfo, page)`:

```ts
const apiKey = process.env.VRT_API_KEY;

export const vrt = apiKey
  ? createVrt({
      apiUrl: 'https://vrt.example.com/api/v1',
      apiKey,
      project: 'checkout',
    })
  : undefined;
```

The instance stores what the key is allowed to send, so `scopes` and
`projectNames` are the server-side narrowing
([permissions](https://github.com/Fishkob/visual-regression/blob/main/docs/permissions.md)).
The pipeline rules around runs, gates and thresholds are in
[ci-integration.md](https://github.com/Fishkob/visual-regression/blob/main/docs/ci-integration.md#4-playwright-captures-sdk).

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
resolution; `scripts/verify.sh` runs it and the release workflow reuses it. The
release publishes **that tarball** — not a rebuild — so the npm artifact and the
release asset are the same bytes. `prepack`/`postpack` keep a manual `npm pack`
equivalent, copying the root licence in and removing it again.
