# Changelog

> **Release history:** the release lines were reset on 2026-11-07
> ([ADR-070](docs/adr/ADR-070-release-baseline-reset.md),
> [ADR-071](docs/adr/ADR-071-platform-baseline-is-1-0-0.md)). The tags of the
> earlier line are retired, so the compare links for those versions no longer
> resolve, and the repository starts at `v1.0.0`. Treat every tag below as
> immutable history — it is never moved, and a released version is never reused.

## [1.0.1](https://github.com/Fishkob/visual-regression/compare/v1.0.0...v1.0.1) (2026-11-07)


### Bug Fixes

* **security:** verify release artifacts and fail closed on deploy defaults ([0182fac](https://github.com/Fishkob/visual-regression/commit/0182fac6c007e3ca0b0702176605447a13e76ebd))

## [1.0.0](https://github.com/Fishkob/visual-regression/releases/tag/v1.0.0) (2026-11-07)


### Miscellaneous Chores

* reset the release line to 1.0.0; no functional change since 3.5.0 ([ADR-071](docs/adr/ADR-071-platform-baseline-is-1-0-0.md))

## [3.5.0](https://github.com/Fishkob/visual-regression/compare/v3.4.0...v3.5.0) (2026-11-07)


### Features

* **sdk:** publish the client to npm ([#18](https://github.com/Fishkob/visual-regression/issues/18)) ([77cb143](https://github.com/Fishkob/visual-regression/commit/77cb14369bdbb2eed3082e32b226fb5b70f3fac2))


### Bug Fixes

* **client-sdk:** make the documented Playwright reporter upload ([#16](https://github.com/Fishkob/visual-regression/issues/16)) ([3edb0ba](https://github.com/Fishkob/visual-regression/commit/3edb0ba3ee700418742499453caf61c648bd9bd2))

## [3.4.0](https://github.com/Fishkob/visual-regression/compare/v3.3.0...v3.4.0) (2026-11-06)


### Features

* **branches:** delete branches idle past a retention window ([93ee09f](https://github.com/Fishkob/visual-regression/commit/93ee09f3326455747dd0338a5f0a5c8889301f2c))
* **viewer:** two panes per row in fullscreen, hide a pane on demand ([497ce69](https://github.com/Fishkob/visual-regression/commit/497ce695904f1f7c8d6ec9257fba2128428d3acc))


### Bug Fixes

* **seeds:** give demo branch candidates the baseline dimensions ([#4](https://github.com/Fishkob/visual-regression/issues/4)) ([4a5eb8b](https://github.com/Fishkob/visual-regression/commit/4a5eb8b2c07362dc60b0e7c8ac142d0842bb30d3))

## [3.3.0](https://github.com/Fishkob/visual-regression/compare/v3.2.0...v3.3.0) (2026-11-06)


### Features

* **overview:** two panes per row in fullscreen ([37c765d](https://github.com/Fishkob/visual-regression/commit/37c765d46b89c18c15d60f5d3588181d266be3df))

## [3.2.0](https://github.com/Fishkob/visual-regression/compare/v3.1.0...v3.2.0) (2026-11-06)


### Features

* **overview:** give the comparison the whole window ([1ce1e23](https://github.com/Fishkob/visual-regression/commit/1ce1e2396c0d89a9683f2a13353a5a63a5d5b5d4))

## [3.1.0](https://github.com/Fishkob/visual-regression/compare/v3.0.0...v3.1.0) (2026-11-06)


### Features

* **branches:** archive and delete a merged branch in one action ([d079f67](https://github.com/Fishkob/visual-regression/commit/d079f67f319954c3aed7b52b73621c8fbb470c07))

## [3.0.0](https://github.com/Fishkob/visual-regression/compare/v2.1.0...v3.0.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* **api:** remove the 4-eyes approval gate

### Features

* **api:** remove the 4-eyes approval gate ([bc02486](https://github.com/Fishkob/visual-regression/commit/bc0248672b97159d549f3716d55529533f453c69))
* **config:** raise the rate-limit defaults ([333038f](https://github.com/Fishkob/visual-regression/commit/333038ffccdf52e1ebe55a6f8d077f4695b6be37))
* **reports:** expose the approval-reason mix in the trends read ([48fd576](https://github.com/Fishkob/visual-regression/commit/48fd576affa9060950b5ff34ee58b86ee7bd9d40))


### Reverts

* remove the approval-reason mix from the trends read ([e63b101](https://github.com/Fishkob/visual-regression/commit/e63b101f72811518cec89ba36e20b8586a436a3e))

## [2.1.0](https://github.com/Fishkob/visual-regression/compare/v2.0.0...v2.1.0) (2026-11-05)


### Features

* **seeds:** give the demo one test per review state ([177475b](https://github.com/Fishkob/visual-regression/commit/177475ba965906ffc0d9547249b84033d2fa9a0e))

## [2.0.0](https://github.com/Fishkob/visual-regression/compare/v1.4.0...v2.0.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* **db:** TOTP_ENCRYPTION_KEY is now required. Existing installations must set it (openssl rand -hex 32) before upgrading. Seeds written before the upgrade keep working and are re-encrypted on the next successful TOTP login.

### Features

* **db:** cache the project's evidence total for the quota check ([a40b9b6](https://github.com/Fishkob/visual-regression/commit/a40b9b6c2cd548020dc1c2072c4dbe778522ea3d))
* harden the worker and finish the threshold/share/review backlog ([9b0ae31](https://github.com/Fishkob/visual-regression/commit/9b0ae3152eb1e1a893660304b2fc9e2bbc5b6ad3))


### Bug Fixes

* **ci:** authenticate the frontend e2e health probes ([92a12da](https://github.com/Fishkob/visual-regression/commit/92a12da7e0b83a3edb62b9983d4b0f816118ae09))
* **ci:** provide TOTP_ENCRYPTION_KEY to the test jobs ([331f963](https://github.com/Fishkob/visual-regression/commit/331f9630ec09b127b53fb6d1c0c1f540f2e40e97))
* **ci:** start the pdf sidecar for the backend e2e job ([d74e3e7](https://github.com/Fishkob/visual-regression/commit/d74e3e7f5aff7ca550c72346bac20bcfbe8e8cc8))
* **db:** enforce cross-row identities and cascade review comments ([755ab51](https://github.com/Fishkob/visual-regression/commit/755ab51f88ec10a182a0d5203b8a18123ecbc632))
* **db:** enforce the schema's invariants and key projects by id ([8d3c1fe](https://github.com/Fishkob/visual-regression/commit/8d3c1fe3ad0d69fbcbd7f905da04c97b1b76e217))
* **e2e:** complete the forced password change when logging in as admin ([c377c25](https://github.com/Fishkob/visual-regression/commit/c377c25ce190dfcbf8d1c8c9e03a0e4b26b2b730))
* **e2e:** replace the bootstrap admin's temporary password before the suite ([27b3ddd](https://github.com/Fishkob/visual-regression/commit/27b3ddd0d355c91177e68537c229ab18832b16a9))
* **review:** close the gaps the approval-race investigation found ([2b3d9af](https://github.com/Fishkob/visual-regression/commit/2b3d9af1c25a67c39c16b3d67361f7f7210f3291))
* **review:** serialize concurrent approvals instead of letting them abort ([74e7ca4](https://github.com/Fishkob/visual-regression/commit/74e7ca4ce59ddae04e39318149832b0a622f46e3))
* **review:** size the approval retry budget for the legal voter count ([309496b](https://github.com/Fishkob/visual-regression/commit/309496bad9b8fa36d27f436cb52cd9617d0fa472))
* **review:** state the approval path's own retry budget ([7c8e022](https://github.com/Fishkob/visual-regression/commit/7c8e02295413088717df238c77fc154faea8460f))
* **scripts:** name only the checks the gate actually skipped ([2ca74dd](https://github.com/Fishkob/visual-regression/commit/2ca74dde3c006cf7622359dbeacddb966dc06fae))
* **scripts:** regenerate the prisma client before the gate reads it ([27f2e22](https://github.com/Fishkob/visual-regression/commit/27f2e2220578b631e3a2986f4c23bb317fba550e))


### Performance Improvements

* **db:** cut round-trips and unbounded reads on the hot paths ([c47baa4](https://github.com/Fishkob/visual-regression/commit/c47baa4961beddf701803adf094b9b7b3cc3ede0))
* **db:** index the substring searches and the webhook outbox sweep ([aecd484](https://github.com/Fishkob/visual-regression/commit/aecd48427d1a03d15cc5e47c2715710465145229))

## [1.4.0](https://github.com/Fishkob/visual-regression/compare/v1.3.0...v1.4.0) (2026-11-01)


### Features

* **sdk:** ship the client SDK as a release tarball ([1149762](https://github.com/Fishkob/visual-regression/commit/11497624488a4886eec4bb2a40ea37eb3e890c7e))

## [1.3.0](https://github.com/Fishkob/visual-regression/compare/v1.2.1...v1.3.0) (2026-10-24)


### Features

* branch-scoped baselines ([#114](https://github.com/Fishkob/visual-regression/issues/114)) ([67a3ad7](https://github.com/Fishkob/visual-regression/commit/67a3ad7822c942858ff013c7a3f7531dd34287ce))
* review inbox and project groups ([#113](https://github.com/Fishkob/visual-regression/issues/113)) ([dc30aff](https://github.com/Fishkob/visual-regression/commit/dc30affc6946c7065a30f19c43e82df6c3652d25))


### Bug Fixes

* **ci:** run quality image as non-root and pin Trivy v0.76.0 ([ae54a30](https://github.com/Fishkob/visual-regression/commit/ae54a308e8f4c7a7df18138ec1970d1189639419))

## [1.2.1](https://github.com/Fishkob/visual-regression/compare/v1.2.0...v1.2.1) (2026-10-19)


### Bug Fixes

* **frontend:** make skip button visible in dark mode ([c7ae6fa](https://github.com/Fishkob/visual-regression/commit/c7ae6fada641d204b5c099930e91bffb2703e105))
* **frontend:** resolve type errors in e2e fixtures and eslint config ([7b4d29a](https://github.com/Fishkob/visual-regression/commit/7b4d29a753ef4a10d8546db07c3dda86a945fffd))

## [1.2.0](https://github.com/Fishkob/visual-regression/compare/v1.1.0...v1.2.0) (2026-10-18)


### Features

* **frontend:** add theme quality guardrails ([#105](https://github.com/Fishkob/visual-regression/issues/105)) ([7f66f6e](https://github.com/Fishkob/visual-regression/commit/7f66f6e2ce7e0df723d2f230b40852acf35cfd6d))


### Bug Fixes

* **dev:** make a fresh checkout boot, migrate and seed cleanly ([#104](https://github.com/Fishkob/visual-regression/issues/104)) ([33e9e04](https://github.com/Fishkob/visual-regression/commit/33e9e04e43686c85d22a3c6af28797fe2c945296))
* **frontend:** respect dark mode in data table background ([b1439a5](https://github.com/Fishkob/visual-regression/commit/b1439a57b7f6c6e204cbc90267a8d5da59897685))

## [1.1.0](https://github.com/Fishkob/visual-regression/compare/v1.0.2...v1.1.0) (2026-10-09)


### Features

* **security:** add pnpm production-dependency classifier ([752b19a](https://github.com/Fishkob/visual-regression/commit/752b19a49f9cbd74f4af48a6fbf19d9a0acbfec6))
* **security:** gate osv findings on production deps only ([b91447e](https://github.com/Fishkob/visual-regression/commit/b91447ee340bc789d398fc958829bacc746f30b4))


### Bug Fixes

* **ci:** install semgrep via pip to avoid Docker Hub rate limit ([e05bb9f](https://github.com/Fishkob/visual-regression/commit/e05bb9f9adce7cba54288eaed4fecdada8650603))
* **deps:** force patched lodash to clear production HIGH ([b9dcc07](https://github.com/Fishkob/visual-regression/commit/b9dcc07886d15751413d6f04fb2b74909b2d4810))
* **deps:** force patched versions of vulnerable transitive packages ([fc37bc5](https://github.com/Fishkob/visual-regression/commit/fc37bc50518893e3634a88e08ca4f7b054ee36f3))
* **deps:** move pnpm overrides to pnpm-workspace.yaml ([38f22dc](https://github.com/Fishkob/visual-regression/commit/38f22dc2979ce65733946824d267f54d7364a113))
* **security:** fail closed when pnpm lockfile lacks an importers section ([30d9ae4](https://github.com/Fishkob/visual-regression/commit/30d9ae47ff0708b2d6069649018e202fe9e4a745))
* **security:** summarize every counted severity in osv-gate ([4d5be0a](https://github.com/Fishkob/visual-regression/commit/4d5be0a2c00ed96d49ee5ee21424e761eaba3664))

## [1.0.2](https://github.com/Fishkob/visual-regression/compare/v1.0.1...v1.0.2) (2026-10-07)


### Bug Fixes

* mount Postgres volume at PG18 data root ([a1fb41c](https://github.com/Fishkob/visual-regression/commit/a1fb41cd931e8c4a3fe34a187942368293673f08))

## [1.0.1](https://github.com/Fishkob/visual-regression/compare/v1.0.0...v1.0.1) (2026-10-07)


### Bug Fixes

* **observability:** add grafana alert rule folder and drop stale alloy.river ref ([faf8d6e](https://github.com/Fishkob/visual-regression/commit/faf8d6ebaba87af8fe6a626030537c10a12c3a57))
* **observability:** read metrics key from file, enable remote-write receiver ([3f95f89](https://github.com/Fishkob/visual-regression/commit/3f95f8956df6c55f9bda77e9dee3ea1de6e12320))
* **observability:** valid prometheus headers and alloy-syntax pipeline ([dcbe837](https://github.com/Fishkob/visual-regression/commit/dcbe83765cd121a296c2394409b4bd6a9d0d4566))

## 1.0.0 (2026-10-05)


### Features

* **deploy:** make image registry configurable ([11a4f8b](https://github.com/Fishkob/visual-regression/commit/11a4f8b7600fd60bc6f586641247fc5822f957f7))
* **deploy:** persist GHCR owner in values.local.yaml ([0828686](https://github.com/Fishkob/visual-regression/commit/0828686ca5bf9783ae564ebaa46e8ff4dd07695d))
* **dev:** default local-dev admin login to admin/admin-secret ([46ce6b3](https://github.com/Fishkob/visual-regression/commit/46ce6b32eb963351f87cbe295921607b3910c94e))
* **frontend:** deepen query seam, review loop, and pass-rule contract ([d705b6e](https://github.com/Fishkob/visual-regression/commit/d705b6e25dc58cad734fbdd368030108ed979751))
* one-command self-hosting via ./install.sh ([671a7d2](https://github.com/Fishkob/visual-regression/commit/671a7d232bca7e61e97a6da943cf5304b51377ff))
* **test:** add test-ids for text-selected UI elements ([8fd37e1](https://github.com/Fishkob/visual-regression/commit/8fd37e1a62d70004eed487300c6840dd356c397d))
* unify rate limiting on scoped Postgres buckets ([ec786b3](https://github.com/Fishkob/visual-regression/commit/ec786b3eea304cfba81d339f1f004a05900f303e))


### Bug Fixes

* **backend:** correct TypeScript config for root config files ([8c81cb1](https://github.com/Fishkob/visual-regression/commit/8c81cb1cd48d62819df7213cb5407aa14dbbec9c))
* **config:** allow empty METRICS_API_KEY so compose default does not crash backend ([6ce542d](https://github.com/Fishkob/visual-regression/commit/6ce542d70f338c651720431362573ed168970e52))
* **deploy:** correct Helm image tags and align dev commands ([97540e2](https://github.com/Fishkob/visual-regression/commit/97540e2506b226beeb2057dede0ac245ed89ca36))
* **deploy:** make deploy.sh executable ([331d64a](https://github.com/Fishkob/visual-regression/commit/331d64a5cd51b81fd1f15ca6b806e71f29a9acdd))
* **deploy:** make setup-k3s.sh executable ([d59972f](https://github.com/Fishkob/visual-regression/commit/d59972f787e5994223125ad0e522e491a3c69f1d))
* **docker:** copy tsconfig.node.json into backend build images ([f64cfbb](https://github.com/Fishkob/visual-regression/commit/f64cfbba569e1ee7fe50b1eb13f2e60ff359c430))
* **e2e:** drop @playwright/test tsconfig path mapping that broke ESM loading ([8007f7d](https://github.com/Fishkob/visual-regression/commit/8007f7d399e8e8cc8ccb1f5456cf4b69a527915b))
* **frontend:** editor-resolve @/lib/test-ids in ct specs via tsconfig ([d40c39a](https://github.com/Fishkob/visual-regression/commit/d40c39a66a7f9cea8d00142ca8d71c7e6f5e97e8))
* **frontend:** resolve lint errors and generate coverage in CI ([c9851a5](https://github.com/Fishkob/visual-regression/commit/c9851a5b943ba1ee3c75060fac2144ae53e5e3c4))
* **query-seam:** surface SDK error responses as query errors ([efb8e67](https://github.com/Fishkob/visual-regression/commit/efb8e6780f183cde3b3ea7ed25d6f29f1cead0e6))
* **security:** patch high-severity dependency advisories ([dc9b9b4](https://github.com/Fishkob/visual-regression/commit/dc9b9b47d3a6296f130d2fcb5a0ee93cbf649a3e))
* **threshold-editor:** parse numeric v-model value on blur ([892be8b](https://github.com/Fishkob/visual-regression/commit/892be8b635073ae25e406228c2e6b8de1f7040d5))
