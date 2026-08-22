# MinIO Alternatives: rustfs vs SeaweedFS

**Date:** 2026-08-22
**Scope:** Is the move off MinIO warranted, and does either `rustfs/rustfs` or `seaweedfs/seaweedfs` fit this repo's S3 usage?
**Researched against primary sources:** GitHub repos + API, official docs (docs.rustfs.com, seaweedfs wiki), Docker Hub, npm, min.io.

---

## TL;DR / Recommendation

- **The premise is TRUE.** `github.com/minio/minio` was **archived by the owner on Apr 25, 2026** and is read-only. The last GitHub release was Oct 2025 and the `minio/minio:latest` Docker image has been frozen since **2025-09-07**. The community edition is now **source-only** ("legacy binaries will not receive updates"). MinIO Inc. continues the software as **AIStor** (free standalone tier requires a license key). So the currently-deployed MinIO is a static, unpatched image — the move is warranted.
- **Both candidates can serve this repo's exact usage** (the 8 `minio`-client ops + anonymous public GET + single-node compose + helm). Backend code likely needs **zero changes** because the `minio` npm client is a generic SigV4 S3 client and the app is behind the `IStorageProvider` seam (ADR-004).
- **Recommendation: switch the self-hosted store to RustFS**, with one caveat — it is still **pre-1.0 (`1.0.0-rc.3`)**. It is the closest drop-in (same ports 9000/9001, MinIO-compatible API, byte-compatible on-disk format, minio-js tested weekly via MinIO's official `mint` suite). If pre-1.0 stability is unacceptable, **SeaweedFS** is the mature alternative (13+ years, stable 4.x) but carries S3-gateway quirks, a heavier master/filer/volume architecture, and a non-MinIO default port.
- Until the swap, **pin the existing `minio/minio:latest`** (it is frozen at 2025-09-07 — pinning removes surprise drift risk).

---

## Premise check: is MinIO actually unmaintained?

**Yes for the OSS server project — with an important nuance.**

Evidence from primary sources:

- **Archived repo.** The GitHub repo banner reads: _"This repository was archived by the owner on Apr 25, 2026. It is now read-only."_ The GitHub API confirms `archived: true`, `pushed_at: 2026-04-24T17:54:39Z`. ([github.com/minio/minio](https://github.com/minio/minio), [API](https://api.github.com/repos/minio/minio))
- **README says so explicitly.** The README opens with: _"THIS REPOSITORY IS NO LONGER MAINTAINED. Alternatives: AIStor Free — Full-featured, standalone edition for community use (free license); AIStor Enterprise — Distributed edition with commercial support."_ ([README.md](https://github.com/minio/minio/blob/master/README.md))
- **No new releases since Oct 2025.** Last GitHub release: `RELEASE.2025-10-15T17-29-55Z` (a security/CVE release) published 2025-10-16. ([minio/minio releases](https://github.com/minio/minio/releases))
- **Community edition is now source-only.** README: _"The MinIO community edition is now distributed as source code only. We will no longer provide pre-compiled binary releases for the community version"_; _"These legacy binaries will not receive updates."_ ([README.md](https://github.com/minio/minio/blob/master/README.md))
- **Docker image frozen.** Docker Hub `minio/minio` `last_updated: 2025-09-07`. That is **11+ months without a published image** as of 2026-08-22 — including no security patches. This is the image this repo's `docker-compose.infra.yml` and helm chart pull via `minio/minio:latest`. ([hub.docker.com/v2/repositories/minio/minio](https://hub.docker.com/v2/repositories/minio/minio/))
- **AIStor is the continuation, but license-gated.** min.io's download page offers AIStor Server/Client/SDK and requires **requesting a license key** (a "Free" tier exists for standalone use, plus a 60-day Enterprise trial). It is no longer an open pull-the-image-and-go distribution. ([min.io/download](https://min.io/download), [min.io/pricing](https://min.io/pricing))
- **The client this repo uses is still fine.** The `minio` npm package (MinIO's JS SDK, `minio/minio-js`) is **not** archived: last push 2026-08-11, latest release **8.0.7** (2026-02-27), npm `minio@latest` = 8.0.7. ([minio/minio-js](https://github.com/minio/minio-js), [registry.npmjs.org/minio](https://registry.npmjs.org/minio))

**Net:** the user's belief is correct for the self-hosted server image path. The repo is archived, no security updates since Oct 2025, and the Docker image is frozen. Staying on the current unpinned `:latest` is a fixed point with no upgrades. The two "stay" options are (a) pin and accept a frozen, unpatched store, or (b) move to AIStor Free (still MinIO software, but license-key gated and a different distribution). The candidates below are the open, unlicensed alternatives.

---

## Candidate profile: RustFS

### What it is

A distributed object storage system written in **Rust** (Apache 2.0) that is, by its own description, a MinIO reimplementation — _"combines the simplicity of MinIO with the memory safety and raw performance of Rust"_, _"supporting migration and coexistence with other S3-compatible platforms such as MinIO and Ceph"_. ([README.md](https://github.com/rustfs/rustfs)) It keeps MinIO's storage model, including a **byte-compatible on-disk format** (per SeaweedFS's README: _"RustFS is a MinIO reimplementation in Rust, Apache 2.0 licensed and still developed, keeping MinIO's storage model down to a byte-compatible on-disk format"_) ([SeaweedFS README, "Compared to MinIO, RustFS"](https://github.com/seaweedfs/seaweedfs#compared-to-minio-rustfs)).

### Architecture

Standalone/distributed S3 server in the MinIO mold — single binary, with **Single Node Mode marked "Available"** and **Distributed Mode marked "Under Testing"**. Ships a console (web UI on 9001), bitrot protection, versioning, bucket replication, event notifications, lifecycle (under testing), multi-tenancy, Keystone auth, and an S3/OpenStack-Swift API. ([Feature & Status table, README.md](https://github.com/rustfs/rustfs))

### Maintenance status / activity

- 31.3k stars, 1.4k forks, **~161 contributors**, 65 open issues, 88 watchers. Last push 2026-08-22. ([GitHub API](https://api.github.com/repos/rustfs/rustfs))
- **Weekly release cadence but still pre-1.0:** `1.0.0-rc.3` (2026-08-21), `1.0.0-rc.2` (2026-08-14), `1.0.0-rc.1` (2026-08-08), `1.0.0-beta.12` (2026-07-30). ([releases](https://github.com/rustfs/rustfs/releases))
- Backed by a company (RustFS, Inc., rustfs.com) but Apache 2.0 and community-developed; runs weekly scheduled test/validation CI incl. MinIO's own mint suite. ([.github/workflows](https://github.com/rustfs/rustfs/tree/main/.github/workflows))
- **Risk:** pre-1.0 (RC.3) and a young project relative to SeaweedFS/MinIO; distributed mode not yet proven.

### S3 API compatibility

Official **S3 compatibility matrix** maintained in-repo, tied to executable test lists: **452 implemented Ceph s3tests** (17 unimplemented, 273 intentionally excluded). ([s3-compatibility-matrix.md](https://github.com/rustfs/rustfs/blob/main/docs/architecture/s3-compatibility-matrix.md))

- Bucket create/delete/list/head — supported
- Object put/get/delete/copy/head — supported
- ListObjects / ListObjectsV2 (prefix, delimiter, marker, max-keys) — supported
- Multipart upload create/upload/complete/abort — supported
- Bucket policy put/get/delete — supported; **PublicAccessBlock** — supported
- Presigned GET/PUT, range + conditional reads, user metadata — supported
- **Planned/not done:** bucket access logging, POST object form upload checksums, bucket ownership controls, IAM-account/multi-storage-class cases.
- **Intentional exclusion:** ACL authorization — canned ACLs (`public-read`) are **not enforced** (confirmed by issue #1874: `PutObject` with `ObjectCannedACLPublicRead` still returns 403 on anonymous GET; a **plain public-read bucket policy with `Principal: "*"` works**). ([issue #1874](https://github.com/rustfs/rustfs/issues/1874))
- SSE note: RustFS encrypts/decrypts its own objects, but **objects MinIO wrote with SSE-S3/KMS/C are not readable by RustFS** (matters only for migrations of encrypted data). ([s3-compatibility-matrix.md](https://github.com/rustfs/rustfs/blob/main/docs/architecture/s3-compatibility-matrix.md))

### `minio` npm client compat

- RustFS is MinIO-shaped by design and runs MinIO's **official `minio/mint` compatibility suite on a weekly schedule** (mint.yml; suites include `awscli`, `mc`, `minio-go`, and the other SDKs in `minio/mint`), plus a daily **`minio-interop`** workflow for on-disk format parity. ([mint.yml](https://github.com/rustfs/rustfs/blob/main/.github/workflows/mint.yml), [minio-interop.yml](https://github.com/rustfs/rustfs/blob/main/.github/workflows/minio-interop.yml))
- The `minio` npm client is the reference client family for this server's API surface; the on-disk `xl.meta` format matches MinIO (XL2 v3, rs-vandermonde, HighwayHash256). ([minio-file-format-compat.md](https://github.com/rustfs/rustfs/blob/main/docs/architecture/minio-file-format-compat.md))

### Deployment fit

- Official Docker image `rustfs/rustfs`, **S3 on 9000, console on 9001 — the same port layout as the current MinIO service**, so the backend's `MINIO_ENDPOINT/port` config needs no change.
- Ships `docker-compose-simple.yml` (non-root user 10001:10001, a volume-permission-helper init, and a `/health` HTTP healthcheck). Single-node mode uses a 4-drive topology (`RUSTFS_VOLUMES=/data/rustfs{0...3}`) and enforces strict disk checks by default (bypassable for dev via `RUSTFS_UNSAFE_BYPASS_DISK_CHECK`). ([docker-compose-simple.yml](https://github.com/rustfs/rustfs/blob/main/docker-compose-simple.yml))
- **Helm charts available** (feature table: "K8s Helm Charts ✅"), published at charts.rustfs.com. ([README.md](https://github.com/rustfs/rustfs), [charts.rustfs.com](https://charts.rustfs.com))

### Risks / gotchas

- Pre-1.0 (RC). Distributed mode untested; rely on single-node.
- No ACL enforcement (public read must be a bucket policy, which is what the app already does via `mc anonymous set download`).
- 88 watchers / 65 open issues — a smaller community than the alternatives; the project's recent star growth is marketing-heavy.
- Weekly RC churn means pinning a specific image tag matters.

---

## Candidate profile: SeaweedFS

### What it is

A distributed storage system in **Go** (Apache 2.0) that is a file system + blob store with an **S3 API gateway** layered on top (the `weed s3` stateless gateway bridges S3 to the Filer). Architecture is master → volume servers (+ optional Filer metadata store). 34.2k stars, 3k forks, **~396 contributors**, 524 watchers, 14.8k commits, 772 open issues. Last push 2026-08-22. ([README.md](https://github.com/seaweedfs/seaweedfs), [GitHub API](https://api.github.com/repos/seaweedfs/seaweedfs))

### Maintenance status / activity

- **Stable 4.x line, weekly releases:** 4.44 (2026-08-22), 4.43 (2026-08-21), 4.42 (2026-08-17), 4.41 (2026-08-06). ([releases](https://github.com/seaweedfs/seaweedfs/releases))
- Long-running project (since ~2011, Facebook-Haystack-inspired), production users documented, enterprise edition exists (seaweedfs.com), sponsored via Patreon. Single dominant maintainer (Chris Lu). ([README.md](https://github.com/seaweedfs/seaweedfs))

### S3 API compatibility

Official S3 API support table (maintained in the wiki, and an AI-generated "Supported APIs vs Minio" comparison):

- Bucket ops (Create/Delete/Head/List), object ops (Put/Get/Delete/DeleteObjects/Head/Copy), ListObjects V1 + V2, multipart — **all Yes**. ([Amazon-S3-API wiki](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API))
- Bucket policy, PublicAccessBlock, CORS, lifecycle, versioning, encryption, object lock, tagging, ACLs — supported. ([Supported-APIs-vs-Minio wiki](https://github.com/seaweedfs/seaweedfs/wiki/Supported-APIs-vs-Minio))
- **Not supported:** bucket notifications, bucket replication, static website hosting, `SelectObjectContent`, Object Lambda, `RestoreObject`. ([Amazon-S3-API wiki](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API))
- **Anonymous/public read is first-class:** `PutBucketPolicy` with `Principal: "*"` (`s3:GetObject`) is documented, plus a shell shortcut `s3.bucket.access -name <bucket> -user anonymous -access Read,List`, and the official docker-compose example grants an `anonymous` identity `Read`. ([S3-Bucket-Policies wiki](https://github.com/seaweedfs/seaweedfs/wiki/S3-Bucket-Policies), [Docker-Compose-for-S3 wiki](https://github.com/seaweedfs/seaweedfs/wiki/Docker-Compose-for-S3))
- **Behavioral quirks (both real dirs + S3 objects):** `DeleteObject` also deletes "folders"; empty folders are auto-cleaned; buckets are collections that pre-allocate ~7 volumes × 30GB by default (the FAQ's most common failure is "no free volumes left" on small disks — needs `-volumeSizeLimitMB` or `fs.configure` tuning). ([S3-API-FAQ wiki](https://github.com/seaweedfs/seaweedfs/wiki/S3-API-FAQ))

### `minio` npm client compat

- No official minio-js page. The official **nodejs page uses `@aws-sdk/client-s3`**, with explicit notes: `forcePathStyle: true`, and **disable checksum injection** (`responseChecksumValidation: WHEN_REQUIRED`, `requestChecksumCalculation: WHEN_REQUIRED`) because x-amz-checksum headers otherwise get written into files. ([nodejs-with-Seaweed-S3 wiki](https://github.com/seaweedfs/seaweedfs/wiki/nodejs-with-Seaweed-S3))
- `minio` npm client does work, but has **open edge-case issues** tracked upstream: delete of non-empty folders via minio client (#3556), empty-file multipart upload with unknown length (#6728), and S3-without-filer setups. ([seaweedfs issues search](https://github.com/search?q=repo%3Aseaweedfs%2Fseaweedfs+minio+client&type=issues))
- The repo's own README admits MinIO _"followed AWS S3 closely and was ideal for testing S3 API… SeaweedFS is trying to catch up here."_ ([README.md](https://github.com/seaweedfs/seaweedfs))

### Deployment fit

- Official image `chrislusf/seaweedfs`. **S3 gateway default port is 8333** (remappable via `-s3.port=9000` on `weed server -s3`). `weed mini` gives a one-command single-node S3 store (with `S3_BUCKET` pre-created, and "Allow All" unauthenticated mode when no AWS keys are set). ([README.md](https://github.com/seaweedfs/seaweedfs), [server.go flags](https://github.com/seaweedfs/seaweedfs/blob/master/weed/command/server.go))
- Docker Compose for S3 is documented (single `weed server -s3` container). ([Docker-Compose-for-S3 wiki](https://github.com/seaweedfs/seaweedfs/wiki/Docker-Compose-for-S3))
- **Helm chart** ships in-repo (`k8s/charts/seaweedfs`) and is published to Artifact Hub; a SeaweedFS Operator and CSI driver exist as separate projects. ([k8s/charts](https://github.com/seaweedfs/seaweedfs/tree/master/k8s/charts), [Artifact Hub](https://artifacthub.io/packages/search?repo=seaweedfs))

### Risks / gotchas

- S3 gateway is a layer over a file system, not a native S3 store — object semantics differ (real directories, collection pre-allocation, folder deletion behavior). Known minio-js edge cases are open.
- More moving parts than the workload needs (master/filer/volume even in single-node); metadata store choice matters for durability.
- 772 open issues — a large, busy backlog (though a stable, high-activity project).
- Default S3 port 8333 differs from the app's current `MINIO_ENDPOINT:minio` / port 9000 assumption.

---

## Comparison table

| Criterion                                   | RustFS                                                               | SeaweedFS                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Language / license**                      | Rust / Apache 2.0                                                    | Go / Apache 2.0                                                              |
| **Architecture**                            | Standalone S3 server (MinIO-style); distributed mode "under testing" | Master + volume servers + Filer, S3 gateway on top                           |
| **Maintenance**                             | Very active, **pre-1.0** (`1.0.0-rc.3`), weekly releases             | Very active, **stable 4.44**, weekly releases, ~13+ yrs                      |
| **Community**                               | 31.3k★, ~161 contributors, 65 open issues, 88 watchers               | 34.2k★, ~396 contributors, 772 open issues, 524 watchers                     |
| **S3 compat (this app's ops)**              | 452 Ceph s3tests passing; all 8 ops supported                        | Official wiki: all 8 ops supported                                           |
| **Anonymous public GET**                    | Bucket policy `Principal:"*"` works; ACLs not enforced               | Bucket policy / `anonymous` identity / `s3.bucket.access`                    |
| **minio npm client**                        | Reference client family; weekly MinIO `mint` suite                   | Works but not the documented client; open edge-case issues; checksum caveats |
| **Default S3 port**                         | **9000** (same as MinIO)                                             | 8333 (remap via `-s3.port=9000`)                                             |
| **docker-compose single node**              | Official compose file, same ports, `/health` probe                   | `weed server -s3` documented; compose example in wiki                        |
| **Helm**                                    | Official charts (charts.rustfs.com)                                  | In-repo chart + Artifact Hub + Operator                                      |
| **On-disk compat with existing MinIO data** | **Byte-compatible** (can read MinIO drives; SSE objects excluded)    | Different storage model (would need data migration)                          |
| **Maturity risk**                           | Pre-1.0 RC                                                           | Production-proven, but S3-gateway quirks + heavier ops                       |

---

## Compatibility assessment against THIS repo's usage

Ground truth of current usage: `MinioStorageService` (`backend/src/modules/internal/storage/services/minio-storage.service.ts`) uses exactly these ops on the `minio` npm client; infra is `docker-compose.infra.yml` + `deploy/charts/vrt/templates/minio.yaml`.

| App op (minio client)                                                  | S3 API                                        | RustFS                                                   | SeaweedFS                           |
| ---------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| `putObject(bucket, key, buf)`                                          | PutObject (single-part)                       | ✅                                                       | ✅                                  |
| `getObject` (streamed)                                                 | GetObject                                     | ✅                                                       | ✅                                  |
| `removeObject`                                                         | DeleteObject                                  | ✅                                                       | ✅                                  |
| `removeObjects`                                                        | DeleteObjects (multi)                         | ✅ (object delete covered; verify multi-delete in spike) | ✅ (`DeleteMultipleObjects` listed) |
| `listObjects(bucket, prefix, true)`                                    | ListObjects V1/V2 prefix+recursive            | ✅                                                       | ✅                                  |
| `statObject`                                                           | HeadObject                                    | ✅                                                       | ✅                                  |
| `bucketExists`                                                         | HeadBucket                                    | ✅                                                       | ✅                                  |
| `makeBucket`                                                           | CreateBucket                                  | ✅                                                       | ✅                                  |
| **Browser anonymous GET** (`mc anonymous set download`, public policy) | PutBucketPolicy → GetObject for `Principal:*` | ✅ (plain policy; issue #1874)                           | ✅ (policy + `anonymous` identity)  |
| `MINIO_ENDPOINT`/port 9000 assumption                                  | —                                             | ✅ same port                                             | ⚠️ needs `-s3.port=9000`            |
| compose healthcheck `mc ready local`                                   | MinIO-admin-specific                          | ⚠️ replace with HTTP `/health` probe                     | ⚠️ replace with probe of S3 port    |
| helm liveness/readiness `/minio/health/live`                           | MinIO-specific path                           | ⚠️ change probe                                          | ⚠️ change probe                     |
| `minio/mc` init job (`mc mb` + `mc anonymous set download`)            | Standard S3 + policy                          | ✅ (mc works against S3 endpoints)                       | ✅ (PutBucketPolicy supported)      |

**Backend code impact: ~zero.** All 8 ops map to supported APIs on both servers, and the client is a plain SigV4 S3 client; the `IStorageProvider` seam (ADR-004: "Switching to another S3-compatible provider is possible by swapping the provider only") means no app-level rewrite. The `MinioStorageService` class name/config (`minio.endpoint`) is cosmetic.

**Infra impact: small for rustfs, small-to-moderate for seaweedfs.**

- `docker-compose.infra.yml`: swap image, adjust healthcheck + init job (few lines).
- Helm `minio.yaml`: image, ports, liveness/readiness paths, init job policy step — a contained template edit.

---

## Effort estimate

| Item                           | Effort                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Backend code change            | **~0** (seam + standard S3 client; only env/config if port/endpoint changes)                   |
| docker-compose.infra.yml swap  | ~0.5 day (image, healthcheck, init job) for either                                             |
| Helm chart (`minio.yaml`) swap | ~1 day (image, probes, ports, anonymous-policy init)                                           |
| RustFS data migration path     | ~0 for new environments; existing MinIO data readable via on-disk compat (unencrypted objects) |
| SeaweedFS data migration path  | Full re-upload/copy (different storage model)                                                  |
| Validation                     | Run existing e2e + the image-loading paths against the candidate (1–2 days incl. spike)        |

**Total realistic: ~2–3 days** for a full swap and validation on either candidate; near-zero if you only want to pin and stay.

---

## Recommendation

**Make the move** — the premise is confirmed and the current deployment is a frozen, unpatched image (no security fixes since Oct 2025).

**Primary pick: RustFS**, for this repo's specific shape:

1. It is a MinIO drop-in by design — same S3 API surface, **same 9000/9001 port layout**, byte-compatible on-disk format (existing MinIO data can even be read directly), and it runs MinIO's own `mint` suite weekly, which is the strongest possible evidence that the `minio` npm client keeps working.
2. The app needs a modest single-node S3-compatible bucket behind a Node `minio` client — exactly the "Single Node Mode" that RustFS marks as available.
3. `mc anonymous set download` (public read) maps to PutBucketPolicy, which RustFS supports.
4. **Caveat / gate:** it is pre-1.0 (`1.0.0-rc.3`). Given the workload (screenshot/diff images — recoverable, non-critical), adopting an RC is a defensible risk, but the conservative path is: **pin the existing `minio/minio:latest` now, swap to RustFS when `1.0.0` stable ships** (releases are weekly; also note the repo has no maintenance urgency — nothing is broken today).

**Fallback: SeaweedFS** if you want battle-tested maturity and accept the trade-offs — a heavier master/filer/volume architecture, default port 8333 (remap needed), S3-gateway quirks (real-directory semantics, volume pre-allocation, minio-js edge cases), and no on-disk migration path. It is a good S3 endpoint for basic ops (all 8 are supported), but it is more machinery than this workload warrants and its S3 compatibility is the weakest of the three for MinIO-style clients.

**Stay-on-MinIO option (unchanged software, different distribution):** AIStor Free — same MinIO codebase, but now license-key gated, so not the open pull-the-image setup this repo currently relies on. Only worth considering if you specifically want to avoid switching servers.

**Bottom line:** RustFS (ideally gated on 1.0.0) is the better fit; SeaweedFS is the mature-but-heavier fallback; staying on the frozen `minio/minio:latest` is the only option that is no longer viable long-term.

---

## Spike: on-disk data migration (2026-08-22)

Empirical verification of the migration path, run with `rustfs/rustfs:1.0.0-rc.3` in Docker against a MinIO-written volume:

1. **4-drive topology does NOT work on a single physical disk.** `RUSTFS_VOLUMES=/data/rustfs{0...3}` fails with `FATAL: local erasure endpoints must use distinct physical disks` whenever all drives share one device — including separate Docker named volumes on one host disk. This is exactly the k8s single-PVC layout, so the 4-drive topology is unusable here without `RUSTFS_UNSAFE_BYPASS_DISK_CHECK=true`.
2. **Single-drive mode works without any flag.** `RUSTFS_VOLUMES=/data` boots cleanly (no bypass needed) and **reads existing MinIO single-drive on-disk data in-place** — bucket listing, object `get`, and anonymous public GET all verified working via `mc` against RustFS. The byte-compatible on-disk format claim holds even for a single-drive MinIO layout.
3. **Public-read policy works.** `mc anonymous set download <bucket>` maps to PutBucketPolicy, which RustFS supports; public GET of an object succeeds afterward.
4. **Volumes need `10001:10001` ownership** (RustFS runs non-root); compose handles it via `volume-permission-helper`, k8s via `fsGroup`.

**Decision applied:** both deployment targets use single-drive `/data` (`RUSTFS_VOLUMES=/data`), one data volume, no bypass flag. Existing k8s MinIO data is preserved in-place — **no `mc mirror` migration required** (the previously-planned fallback was cancelled).
