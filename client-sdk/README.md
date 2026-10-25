# client-sdk

Typed TypeScript SDK for the Visual Regression API. The generated surface lives
in `index.ts`/`sdk.gen.ts`/`models/` (never edit those by hand); this README
covers the two hand-written helpers on top:

- `client-sdk/upload-many` — bounded-concurrency batch upload with retries.
- `client-sdk/playwright` — a Playwright reporter that uploads screenshots.

The package has **zero runtime dependencies** (it uses `globalThis.fetch`).

## Upload one capture

```ts
import { createClient, createConfig } from "client-sdk/client";
import { uploadControllerUpload } from "client-sdk";

const client = createClient(
  createConfig({
    baseUrl: "https://vrt.example.com/api/v1",
    headers: { "x-api-key": process.env.VRT_API_KEY! },
  }),
);

await uploadControllerUpload({
  client,
  path: { projectName: "checkout", testName: "login" },
  query: { testKind: "image" },
  body: {
    file: new Blob([pngBytes], { type: "image/png" }),
    viewport: "1920x1080",
    browser: "chromium",
    environment: "staging",
    branch: "main",
    runKey: process.env.GITHUB_RUN_ID,
  },
});
```

## `uploadMany` (batch)

```ts
import { uploadMany } from "client-sdk/upload-many";

const results = await uploadMany(captures, {
  apiKey: process.env.VRT_API_KEY!,
  baseUrl: "https://vrt.example.com/api/v1",
  concurrency: 4,      // default 4, max 16
  maxAttempts: 3,      // default 3
  retryDelayMs: 500,   // exponential backoff base
  onProgress: (done, total) => console.log(`${done}/${total}`),
});

const failed = results.filter((result) => !result.ok);
```

- Retries only `429`, `5xx` and network errors; honours `Retry-After`.
- Results keep the input order and never reject for a single capture failure.
- A `runKey` on each capture groups the batch into one run.

## Playwright reporter

```ts
// playwright.config.ts
import { createVrtReporter } from "client-sdk/playwright";

export default defineConfig({
  reporter: [
    ["list"],
    [
      "client-sdk/playwright",
      {
        apiUrl: "https://vrt.example.com/api/v1",
        apiKey: process.env.VRT_API_KEY!,
        project: "checkout",
        runKey: process.env.GITHUB_RUN_ID,
        branch: process.env.GITHUB_HEAD_REF || "main",
        environment: "ci",
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

## Building

```bash
pnpm --filter ./client-sdk build
pnpm --filter ./client-sdk test
```

`exports` maps `client-sdk/upload-many` and `client-sdk/playwright` to the
hand-written sources; `tsc` emits them under `dist/src/`.
