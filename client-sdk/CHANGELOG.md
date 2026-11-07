# Changelog

## [4.0.0](https://github.com/Fishkob/visual-regression/compare/vrt-client-v3.5.0...vrt-client-v4.0.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* **api:** remove the 4-eyes approval gate

### Features

* **api-keys:** manage API keys from the dashboard ([48655ec](https://github.com/Fishkob/visual-regression/commit/48655ecfa0616607994f4db43948d8c0b45f8a7c))
* **api:** delete an API key whether or not it has been used ([f438308](https://github.com/Fishkob/visual-regression/commit/f438308f78e8e3a9129ce4ab5706791a17c47f93))
* **api:** remove the 4-eyes approval gate ([bc02486](https://github.com/Fishkob/visual-regression/commit/bc0248672b97159d549f3716d55529533f453c69))
* **approvals:** approve all pending variants of a test ([bc436be](https://github.com/Fishkob/visual-regression/commit/bc436bef2f099748d8e4a51cfdf32ade6195174a))
* **approvals:** record and surface a durable approval audit trail ([89544ad](https://github.com/Fishkob/visual-regression/commit/89544adc972b0a3c4c20df0c8b351f4d2f0d280f))
* **audit:** add the global audit trail and record approvals, restores and webhook changes ([5ec178f](https://github.com/Fishkob/visual-regression/commit/5ec178f8446e75a269dd697871ed1b3f356b0d04))
* **auth:** add TOTP, session management and CSRF hardening ([f851466](https://github.com/Fishkob/visual-regression/commit/f8514660a9030078b370234afb2a7c1f912457fc))
* **auth:** add users, roles and enforced permissions ([4d02b33](https://github.com/Fishkob/visual-regression/commit/4d02b333bee7854ded7f424e68d03bd3b9eac103))
* **auth:** scope API keys and confine them to projects ([440ba29](https://github.com/Fishkob/visual-regression/commit/440ba291fa8c1fa3d83ee68a2239735307241b36))
* baseline overview and variant gallery for image tests ([#115](https://github.com/Fishkob/visual-regression/issues/115)) ([183112d](https://github.com/Fishkob/visual-regression/commit/183112d77e3ff92cae9c24ea01ed5a0417887bd2))
* **baselines:** retain and restore replaced baselines ([ed2a87b](https://github.com/Fishkob/visual-regression/commit/ed2a87b3c808e0c600d18b3736d28641ca9491e2))
* branch-scoped baselines ([#114](https://github.com/Fishkob/visual-regression/issues/114)) ([67a3ad7](https://github.com/Fishkob/visual-regression/commit/67a3ad7822c942858ff013c7a3f7531dd34287ce))
* **branches:** delete branches idle past a retention window ([93ee09f](https://github.com/Fishkob/visual-regression/commit/93ee09f3326455747dd0338a5f0a5c8889301f2c))
* **bulk:** add per-item approval, deletion and group moves ([c0f7606](https://github.com/Fishkob/visual-regression/commit/c0f7606d093d5bbc18278aedc70cd57972b96334))
* **ci:** wait for queued comparisons and ship a GitHub Action ([5cf4bd2](https://github.com/Fishkob/visual-regression/commit/5cf4bd2c01ca44756e13e968684510c378c06601))
* harden the worker and finish the threshold/share/review backlog ([9b0ae31](https://github.com/Fishkob/visual-regression/commit/9b0ae3152eb1e1a893660304b2fc9e2bbc5b6ad3))
* **images:** accept JPEG/WebP and add per-test size policies ([682ab5a](https://github.com/Fishkob/visual-regression/commit/682ab5aa68f739c134c8f7eb36ef4ffb3c57f28f))
* mark where a comparison changed, not just how much ([0c74d74](https://github.com/Fishkob/visual-regression/commit/0c74d745efdf610b7b45960ca86b6efeeb2b7020))
* presigned storage URLs and server-side list pagination ([8da3379](https://github.com/Fishkob/visual-regression/commit/8da3379753fc6020ad33299d42315dd256dabb6d))
* **projects:** expose and update required approvals ([f5a39b2](https://github.com/Fishkob/visual-regression/commit/f5a39b273c3cb89a4682e7f5fff6ce648e4975b2))
* **projects:** rename projects with audit history ([3976917](https://github.com/Fishkob/visual-regression/commit/397691785537d3b1cd2b5c65b24772ff2a19c8c9))
* **reports:** add run reports, outcome history and project trends ([1c271cb](https://github.com/Fishkob/visual-regression/commit/1c271cb6d20b6cfabaa05752004b09b87078ecfc))
* **reports:** expose the approval-reason mix in the trends read ([48fd576](https://github.com/Fishkob/visual-regression/commit/48fd576affa9060950b5ff34ee58b86ee7bd9d40))
* **reports:** include failed jobs and write the JUnit report from CI ([1753477](https://github.com/Fishkob/visual-regression/commit/17534777826c2fd651e7c4b71485a10f9b5f229e))
* **retention:** enforce per-project limits and add a dry-run preview ([760da9a](https://github.com/Fishkob/visual-regression/commit/760da9a24cb43d4721b75684dd6eee317f5fcbc7))
* review inbox and project groups ([#113](https://github.com/Fishkob/visual-regression/issues/113)) ([dc30aff](https://github.com/Fishkob/visual-regression/commit/dc30affc6946c7065a30f19c43e82df6c3652d25))
* **review:** add assignments, SLA data and 4-eyes approvals ([4fdb6f0](https://github.com/Fishkob/visual-regression/commit/4fdb6f0272556fd47c8db540d48ecfed0b2c7916))
* **review:** add comment threads and structured approval reasons ([e81c902](https://github.com/Fishkob/visual-regression/commit/e81c902231140ceedf517ca6309cb3461b6e2ed3))
* **review:** complete 4-eyes, assignments and SLA UI ([bfcc170](https://github.com/Fishkob/visual-regression/commit/bfcc1708e2c3975f163cb2e00698439a93ab94b2))
* **review:** gate review policy and enforce human-only 4-eyes ([f06a49d](https://github.com/Fishkob/visual-regression/commit/f06a49db4facb38116922255ad21ad8fe5b5c671))
* **review:** surface pending votes in bulk and run approvals ([b7da54f](https://github.com/Fishkob/visual-regression/commit/b7da54f3cf33abd93eb3418ac85f487ad81ff74b))
* **runs:** expose muted pending comparisons to the gate ([66270da](https://github.com/Fishkob/visual-regression/commit/66270da6b61d9e4cbee1e021e2894fc8189ed8e6))
* **runs:** group uploads into CI runs and derive gate status ([78aa7de](https://github.com/Fishkob/visual-regression/commit/78aa7de889c26bb57e0f758fcff66d29eebf1467))
* **runs:** record every run upload and cover grouping with an e2e test ([792cbc5](https://github.com/Fishkob/visual-regression/commit/792cbc54d8b40eda9faa05846e18447c309a3886))
* **sdk:** add batch upload and a Playwright reporter ([f0feb95](https://github.com/Fishkob/visual-regression/commit/f0feb959632f9a542558e4166c1c61ab5324d2df))
* **sdk:** publish the client to npm ([#18](https://github.com/Fishkob/visual-regression/issues/18)) ([77cb143](https://github.com/Fishkob/visual-regression/commit/77cb14369bdbb2eed3082e32b226fb5b70f3fac2))
* **sdk:** ship the client SDK as a release tarball ([1149762](https://github.com/Fishkob/visual-regression/commit/11497624488a4886eec4bb2a40ea37eb3e890c7e))
* **search:** add global project/test/branch search ([9c27d31](https://github.com/Fishkob/visual-regression/commit/9c27d31f009b97cd645adc52acf8ee03bc1acccb))
* **shares:** add expiring read-only share links ([3956eba](https://github.com/Fishkob/visual-regression/commit/3956eba641d7bfd159b4a8c1a4f3fb44708ffb53))
* **storage:** admin-gate and audit retention settings ([5494005](https://github.com/Fishkob/visual-regression/commit/5494005293854a51ba5fb165251953111b94a293))
* **storage:** track usage, enforce quotas and store retention settings ([631108a](https://github.com/Fishkob/visual-regression/commit/631108adb9c369ddb686f12c769dffb9cef1ae44))
* **tests:** add rename, tags, mute and flake metadata ([3b78351](https://github.com/Fishkob/visual-regression/commit/3b783516b57ed3a1b9a2cc20a23acf2174118e02))
* **webhooks:** deliver signed review and approval events ([2b02b5a](https://github.com/Fishkob/visual-regression/commit/2b02b5a592f0fa9b04bb8987ddf14940fc759685))


### Bug Fixes

* **api:** type string arrays as flat arrays in the SDK ([f240847](https://github.com/Fishkob/visual-regression/commit/f24084728b01d87b9214b3bde4fff64c557b3368))
* **audit:** document the paginated response and nullable string fields ([9ed6e1c](https://github.com/Fishkob/visual-regression/commit/9ed6e1c391869a1cd23f43ec96a72e85d5af9bca))
* **auth:** close the audit and offboarded-key gaps the ADR review exposed ([d131a0b](https://github.com/Fishkob/visual-regression/commit/d131a0b1fbcbe482b84d69d43ea72db408849a0e))
* **auth:** type recovery codes as a string array ([2f62cc1](https://github.com/Fishkob/visual-regression/commit/2f62cc12d4a47b6bda54a983eaa4249573988841))
* **backend:** harden launch-blocking security and reliability gaps ([c076ad6](https://github.com/Fishkob/visual-regression/commit/c076ad692059245eb69675f89dfcc3f52a0a20d9))
* **backend:** harden security, reliability and data lifecycle ([b11b3cc](https://github.com/Fishkob/visual-regression/commit/b11b3cc8caa4f333e0163aecee615e845c6c3fd4))
* **client-sdk:** make the documented Playwright reporter upload ([#16](https://github.com/Fishkob/visual-regression/issues/16)) ([3edb0ba](https://github.com/Fishkob/visual-regression/commit/3edb0ba3ee700418742499453caf61c648bd9bd2))
* **sdk:** publish the gate's tarball instead of versioning and rebuilding ([#20](https://github.com/Fishkob/visual-regression/issues/20)) ([4f82e1c](https://github.com/Fishkob/visual-regression/commit/4f82e1c6cb5a6b35a78a82f0be0633c11f556842))
* **sdk:** type the nullable baseline-history columns in the schema ([384ec1c](https://github.com/Fishkob/visual-regression/commit/384ec1c967bdb0c2ef4a5fb2b8afadbf99daab58))


### Reverts

* remove the approval-reason mix from the trends read ([e63b101](https://github.com/Fishkob/visual-regression/commit/e63b101f72811518cec89ba36e20b8586a436a3e))
