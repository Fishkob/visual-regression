# ADR 080: Captures Are Explicit Calls, Not Playwright Attachments

## Status

Accepted — 2026-11-13. Replaces the attachment-reading Playwright reporter in
`@fishkob/vrt` — documented, but never itself the subject of an ADR
([ADR-056](./ADR-056-client-sdk-distribution.md) and
[ADR-057](./ADR-057-config-as-code-thresholds.md) only mention it in passing). It
does not change the API contract or the platform; the client keeps its own
release line ([ADR-069](./ADR-069-independent-client-version.md)).

## Context

The first Playwright integration was a reporter: it looked at the attachments a
test result carried, picked the first one whose content type or name looked like
a screenshot or a PDF, and uploaded it at `onTestEnd`. The pitch was "one call in
the test, no extra API" — the test attaches a screenshot for the HTML report and
the reporter reuses it.

That convenience was paid for at three places:

- **Intent was inferred.** The reporter could not know whether an attachment was
  meant for VRT; it guessed from `image/png`, names containing `screenshot` and
  `.png`/`.pdf` paths, and took the first match. Any PNG a test attached for
  debugging was uploaded as a capture.
- **Playwright's own artifacts were harvested.** A failing `toHaveScreenshot`
  attaches `-expected`, `-actual` and `-diff`, with `-expected` first; the
  reporter thus uploaded the snapshot committed to the repository instead of the
  new rendering. The upload either short-circuited as `identical` or produced a
  comparison between two baselines.
- **Control became a property of attachments.** "Is anything sent?" could only
  be answered by inspecting the attachment list, which turned into reporter
  options (`uploadOnFailureOnly`, `skipRetries`), naming rules and a documented
  opt-in — machinery around a channel that was never designed to say what a file
  is for.

Attachments are a public Playwright API and reporters that read them are
legitimate (the HTML and blob reporters do). The defect was not the transport;
it was interpreting an artifact list as an instruction.

## Decision

1. **A capture is a call.** `createVrt(options)` from `@fishkob/vrt/playwright`
   returns a client whose `capture(testInfo, source, options?)` takes a page, a
   `Uint8Array` or a `Blob` and uploads it immediately. The test decides per
   capture; there is no reporter and no attachment.
2. **The reporter is removed.** The `@fishkob/vrt/playwright` subpath keeps its
   name and now exports the capture client. The attachment-reading reporter, its
   `uploadOnFailureOnly`/`skipRetries` options and the `results()` seam are gone.
3. **Uploads never throw.** Network and API failures resolve to a
   `CaptureUploadResult` with `ok: false` (and reach `onUpload`); a page that
   cannot be screenshotted throws, because that is a test bug rather than an
   upload failure.
4. **Failure-only is a hook, not an option.** Uploading only failed attempts is
   `if (testInfo.status !== testInfo.expectedStatus)` in an `afterEach`; the
   library does not need to model Playwright's retry lifecycle for it.
5. **The client stays dependency-free.** `VrtTestInfo`, `VrtPage` and the byte
   source are structural subsets of Playwright's types, so the package keeps its
   zero-runtime-dependency promise and its public types stay free of Node and
   Playwright globals.

## Rationale

- **Explicit beats inferred.** What is uploaded is visible at the call site
  instead of derived from an attachment list; there is no ordering, naming or
  content-type rule to get wrong.
- **No snapshot artifacts.** `toHaveScreenshot` images are Playwright's own
  baselines and stay out of VRT entirely; two baseline stores cannot silently
  diverge through the client.
- **No disk round-trip.** The bytes go from the test to the API; they are not
  first written into `test-results/` and read back.
- **Failure-only becomes trivial.** The test already knows its status in an
  `afterEach`; the library does not have to reproduce Playwright's verdict.

## Alternatives Considered

- **Keep the reporter and only prefer `-actual`.** Rejected: the smallest fix,
  but intent is still inferred, arbitrary screenshot attachments are still
  uploaded, and the disk round-trip remains.
- **Mark attachments (`vrt`/`vrt:*`).** Rejected: it removes the guess and the
  `-expected` collision with a one-word change, but the capture still travels
  through Playwright's artifact store and the reporter still owns the lifecycle.
  It keeps a second way to do the same thing.
- **A Playwright fixture exported by the package.** Rejected: `base.extend`
  needs `@playwright/test` at runtime, which breaks the zero-dependency promise.
  The client can be wrapped in a user fixture in a few lines; the package does
  not ship one.
- **Keep the reporter next to the capture API.** Rejected: two paths, and the
  one kept for compatibility is the one that guesses.

## Consequences

- A client major: the reporter export and its options are removed, and the docs,
  the package check and the e2e spec move to the capture API. Existing users
  migrate one `testInfo.attach(...)` call to `vrt.capture(testInfo, page)`.
- `uploadOnFailureOnly`/`skipRetries` have no replacement option; the documented
  pattern is the `afterEach` check above, which can also honour `testInfo.retry`.
- Non-Playwright stacks keep using `uploadMany` from
  `@fishkob/vrt/upload-many`; nothing changed there.
- The platform is untouched: uploads, runs, comparisons and review paths are the
  same.
