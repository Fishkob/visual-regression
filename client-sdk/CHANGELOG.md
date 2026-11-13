# Changelog

## [4.0.0](https://github.com/Fishkob/visual-regression/compare/vrt-client-v3.1.0...vrt-client-v4.0.0) (2026-11-13)


### ⚠ BREAKING CHANGES

* **client-sdk:** @fishkob/vrt/playwright no longer exports the reporter. Replace `testInfo.attach("screenshot", ...)` and the reporter config with `createVrt({...})` and `await vrt.capture(testInfo, page)`; `uploadOnFailureOnly` becomes the afterEach pattern documented in docs/ci-integration.md.

### Features

* **client-sdk:** capture explicitly instead of through attachments ([#89](https://github.com/Fishkob/visual-regression/issues/89)) ([bf273e9](https://github.com/Fishkob/visual-regression/commit/bf273e9cc78fcc1fc2f260f4885099476970bd0b))

## [3.1.0](https://github.com/Fishkob/visual-regression/compare/vrt-client-v3.0.0...vrt-client-v3.1.0) (2026-11-13)


### Features

* **review:** page the comment thread by cursor ([#72](https://github.com/Fishkob/visual-regression/issues/72)) ([9b8fe4d](https://github.com/Fishkob/visual-regression/commit/9b8fe4d6a29765b1d7af396b769f441cc14e897b))
* **webhooks:** notify when a comparison job fails for good ([#68](https://github.com/Fishkob/visual-regression/issues/68)) ([5e2547c](https://github.com/Fishkob/visual-regression/commit/5e2547c74d2c046025c07a66ed64088f71691ca3))

## [3.0.0](https://github.com/Fishkob/visual-regression/compare/vrt-client-v2.0.0...vrt-client-v3.0.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* **users:** `POST /users` and `POST /users/:id/reset-password` no longer return `temporaryPassword`. The regenerated SDK, the admin dialog that now shows the link, and the e2e suites move with them. ADR-075 supersedes the account-lifecycle bullets of ADR-031.

### Features

* **users:** issue one-time invite links instead of temporary passwords ([#60](https://github.com/Fishkob/visual-regression/issues/60)) ([f3e5976](https://github.com/Fishkob/visual-regression/commit/f3e5976732b3d93e3e9161e3b1fb9e0ec8a76460))

## [2.0.0](https://github.com/Fishkob/visual-regression/compare/vrt-client-v1.0.0...vrt-client-v2.0.0) (2026-11-08)


### ⚠ BREAKING CHANGES

* **auth:** remove TOTP two-factor authentication ([#53](https://github.com/Fishkob/visual-regression/issues/53))

### Features

* **auth:** remove TOTP two-factor authentication ([#53](https://github.com/Fishkob/visual-regression/issues/53)) ([4b291ed](https://github.com/Fishkob/visual-regression/commit/4b291ed6b3188a1c8dec3a6d7ec5eea23c56be2e))

## [1.0.0](https://github.com/Fishkob/visual-regression/releases/tag/vrt-client-v1.0.0) (2026-11-07)


### Miscellaneous Chores

* start the independent client line at 1.0.0; no functional change since 3.5.0 ([ADR-070](../docs/adr/ADR-070-release-baseline-reset.md))
