# Changelog

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
