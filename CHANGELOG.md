# Changelog

## [2.1.0](https://github.com/Fishkob/visual-regression/compare/v2.0.0...v2.1.0) (2026-11-05)


### Features

* **seeds:** give the demo one test per review state ([3dc43ad](https://github.com/Fishkob/visual-regression/commit/3dc43ad88b5cf7183a4fcb279c50f5a925fa825d))

## [2.0.0](https://github.com/Fishkob/visual-regression/compare/v1.4.0...v2.0.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* **db:** TOTP_ENCRYPTION_KEY is now required. Existing installations must set it (openssl rand -hex 32) before upgrading. Seeds written before the upgrade keep working and are re-encrypted on the next successful TOTP login.

### Features

* **db:** cache the project's evidence total for the quota check ([2418cf6](https://github.com/Fishkob/visual-regression/commit/2418cf6cdbe8b2874ea5b262ad76b6107dacdeea))
* harden the worker and finish the threshold/share/review backlog ([11ee756](https://github.com/Fishkob/visual-regression/commit/11ee7566c737ef19e52a9c0a54d6088fc1808581))


### Bug Fixes

* **ci:** authenticate the frontend e2e health probes ([8ad263c](https://github.com/Fishkob/visual-regression/commit/8ad263cd7a80bd710cc0d79bb35e27fb2cde6c31))
* **ci:** provide TOTP_ENCRYPTION_KEY to the test jobs ([70206d0](https://github.com/Fishkob/visual-regression/commit/70206d0b960cdeeae61145af3bd5d623b49279bd))
* **ci:** start the pdf sidecar for the backend e2e job ([93eb68e](https://github.com/Fishkob/visual-regression/commit/93eb68e0b58bd022caa64b223e5284084f571a17))
* **db:** enforce cross-row identities and cascade review comments ([1b6812c](https://github.com/Fishkob/visual-regression/commit/1b6812cd3fd029b6533fbc323edd27e35a5d7490))
* **db:** enforce the schema's invariants and key projects by id ([7754683](https://github.com/Fishkob/visual-regression/commit/7754683e7aee0abd8dcd490b889e8ea0c785aab8))
* **e2e:** complete the forced password change when logging in as admin ([24827e5](https://github.com/Fishkob/visual-regression/commit/24827e55dd9403b75af10cdb5418a45f18a7fcc7))
* **e2e:** replace the bootstrap admin's temporary password before the suite ([1511858](https://github.com/Fishkob/visual-regression/commit/15118585e0a19806dbb085d2d0f8693d03b64b49))
* **review:** close the gaps the approval-race investigation found ([b11533d](https://github.com/Fishkob/visual-regression/commit/b11533d92b6a5b1a8ed2953d2a389f87c411c0ad))
* **review:** serialize concurrent approvals instead of letting them abort ([7f5fdce](https://github.com/Fishkob/visual-regression/commit/7f5fdceb6fb431c073b62c8815e4919908fb038d))
* **review:** size the approval retry budget for the legal voter count ([6f0b83f](https://github.com/Fishkob/visual-regression/commit/6f0b83fba55e056d309afe474bdab9bbc3a4658c))
* **review:** state the approval path's own retry budget ([2755a64](https://github.com/Fishkob/visual-regression/commit/2755a6416eb7b80d57cde062a9b2513439854d6d))
* **scripts:** name only the checks the gate actually skipped ([34f798a](https://github.com/Fishkob/visual-regression/commit/34f798a083b20e136ccbe5e20252841b153efed4))
* **scripts:** regenerate the prisma client before the gate reads it ([4d8f2b2](https://github.com/Fishkob/visual-regression/commit/4d8f2b24b005d38d4593792617f34f4de8b6998f))


### Performance Improvements

* **db:** cut round-trips and unbounded reads on the hot paths ([3a5da00](https://github.com/Fishkob/visual-regression/commit/3a5da006da40418e50735bb79159fe87fc09d6d1))
* **db:** index the substring searches and the webhook outbox sweep ([14a5372](https://github.com/Fishkob/visual-regression/commit/14a537249bc9e2f3999f7b81d2c40fd7ff4541e6))

## [1.4.0](https://github.com/Fishkob/visual-regression/compare/v1.3.0...v1.4.0) (2026-11-01)


### Features

* **sdk:** ship the client SDK as a release tarball ([1eacd09](https://github.com/Fishkob/visual-regression/commit/1eacd09b531e8e0c1174351324cc47c4e32f48d4))

## [1.3.0](https://github.com/Fishkob/visual-regression/compare/v1.2.1...v1.3.0) (2026-10-24)


### Features

* branch-scoped baselines ([#114](https://github.com/Fishkob/visual-regression/issues/114)) ([1b07a02](https://github.com/Fishkob/visual-regression/commit/1b07a0226ddd25ad41f94e5d6892a6422b6a8809))
* review inbox and project groups ([#113](https://github.com/Fishkob/visual-regression/issues/113)) ([83dcb86](https://github.com/Fishkob/visual-regression/commit/83dcb86ca02592ece7a37b15df0e18b7adb0f493))


### Bug Fixes

* **ci:** run quality image as non-root and pin Trivy v0.76.0 ([c0f5961](https://github.com/Fishkob/visual-regression/commit/c0f596175bffc3cfa5b064c6af66a586c216b28d))

## [1.2.1](https://github.com/Fishkob/visual-regression/compare/v1.2.0...v1.2.1) (2026-10-19)


### Bug Fixes

* **frontend:** make skip button visible in dark mode ([bbc8627](https://github.com/Fishkob/visual-regression/commit/bbc8627545a0ed722c3faea120087850cc9f29e1))
* **frontend:** resolve type errors in e2e fixtures and eslint config ([49d9e49](https://github.com/Fishkob/visual-regression/commit/49d9e49213560cc1248819d2fddad8a5c516d031))

## [1.2.0](https://github.com/Fishkob/visual-regression/compare/v1.1.0...v1.2.0) (2026-10-18)


### Features

* **frontend:** add theme quality guardrails ([#105](https://github.com/Fishkob/visual-regression/issues/105)) ([c7a60a1](https://github.com/Fishkob/visual-regression/commit/c7a60a1dda1b56bcdd6e48476441eb7e13fb067f))


### Bug Fixes

* **dev:** make a fresh checkout boot, migrate and seed cleanly ([#104](https://github.com/Fishkob/visual-regression/issues/104)) ([d7d7457](https://github.com/Fishkob/visual-regression/commit/d7d7457fdf835dbab475ac89e3dca6aaccf16954))
* **frontend:** respect dark mode in data table background ([1feaefc](https://github.com/Fishkob/visual-regression/commit/1feaefc867b22acef521d206316e00681023fd59))

## [1.1.0](https://github.com/Fishkob/visual-regression/compare/v1.0.2...v1.1.0) (2026-10-09)


### Features

* **security:** add pnpm production-dependency classifier ([e4681b6](https://github.com/Fishkob/visual-regression/commit/e4681b676a0b3dd8fdfd07dbd59dfa6acd894558))
* **security:** gate osv findings on production deps only ([a4f47f0](https://github.com/Fishkob/visual-regression/commit/a4f47f0172af9399b0617fe5287244b17b17086a))


### Bug Fixes

* **ci:** install semgrep via pip to avoid Docker Hub rate limit ([09234f2](https://github.com/Fishkob/visual-regression/commit/09234f21903f63b37fb45a1aafd14d92da877e20))
* **deps:** force patched lodash to clear production HIGH ([6f2e441](https://github.com/Fishkob/visual-regression/commit/6f2e4413d53d75bc3905ccb49879af7d7cf2272d))
* **deps:** force patched versions of vulnerable transitive packages ([e68fd4f](https://github.com/Fishkob/visual-regression/commit/e68fd4f4ec272d2ed0c3bc80cc00b8dc0d09a8ae))
* **deps:** move pnpm overrides to pnpm-workspace.yaml ([f6f8692](https://github.com/Fishkob/visual-regression/commit/f6f869299177d2ac509ca5c972501793f17cbe9a))
* **security:** fail closed when pnpm lockfile lacks an importers section ([5b1f791](https://github.com/Fishkob/visual-regression/commit/5b1f791bbf71bed197db71f9eee7fca301ae0703))
* **security:** summarize every counted severity in osv-gate ([15a4300](https://github.com/Fishkob/visual-regression/commit/15a43006019ee25306fac370858f8e33a05c87fc))

## [1.0.2](https://github.com/Fishkob/visual-regression/compare/v1.0.1...v1.0.2) (2026-10-07)


### Bug Fixes

* mount Postgres volume at PG18 data root ([174b5ee](https://github.com/Fishkob/visual-regression/commit/174b5ee36b1c4a35b0d84e796b8d4fcadf9d7ce4))

## [1.0.1](https://github.com/Fishkob/visual-regression/compare/v1.0.0...v1.0.1) (2026-10-07)


### Bug Fixes

* **observability:** add grafana alert rule folder and drop stale alloy.river ref ([0c49647](https://github.com/Fishkob/visual-regression/commit/0c49647a69fbd381459c1e462f339d0a6593b935))
* **observability:** read metrics key from file, enable remote-write receiver ([8c27923](https://github.com/Fishkob/visual-regression/commit/8c279232c803aa91ddce8d1e875f774af16ddde7))
* **observability:** valid prometheus headers and alloy-syntax pipeline ([4609fc4](https://github.com/Fishkob/visual-regression/commit/4609fc4b1e3076ef2e872705d83fd79c9b2170a2))

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
