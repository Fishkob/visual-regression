# Changelog

## [5.0.0](https://github.com/Fishkob/visual-regression/compare/v4.0.0...v5.0.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* **api:** remove the 4-eyes approval gate
* **db:** TOTP_ENCRYPTION_KEY is now required. Existing installations must set it (openssl rand -hex 32) before upgrading. Seeds written before the upgrade keep working and are re-encrypted on the next successful TOTP login.

### Features

* **api-keys:** manage API keys from the dashboard ([48655ec](https://github.com/Fishkob/visual-regression/commit/48655ecfa0616607994f4db43948d8c0b45f8a7c))
* **api:** delete an API key whether or not it has been used ([f438308](https://github.com/Fishkob/visual-regression/commit/f438308f78e8e3a9129ce4ab5706791a17c47f93))
* **api:** remove the 4-eyes approval gate ([bc02486](https://github.com/Fishkob/visual-regression/commit/bc0248672b97159d549f3716d55529533f453c69))
* **approvals:** approve all pending variants of a test ([bc436be](https://github.com/Fishkob/visual-regression/commit/bc436bef2f099748d8e4a51cfdf32ade6195174a))
* **approvals:** record and surface a durable approval audit trail ([89544ad](https://github.com/Fishkob/visual-regression/commit/89544adc972b0a3c4c20df0c8b351f4d2f0d280f))
* **audit:** add the global audit trail and record approvals, restores and webhook changes ([5ec178f](https://github.com/Fishkob/visual-regression/commit/5ec178f8446e75a269dd697871ed1b3f356b0d04))
* **audit:** record test, project and branch deletions with their actor ([92fcaf2](https://github.com/Fishkob/visual-regression/commit/92fcaf2071830393215a6262f20363e239248826))
* **auth:** add TOTP, session management and CSRF hardening ([f851466](https://github.com/Fishkob/visual-regression/commit/f8514660a9030078b370234afb2a7c1f912457fc))
* **auth:** add users, roles and enforced permissions ([4d02b33](https://github.com/Fishkob/visual-regression/commit/4d02b333bee7854ded7f424e68d03bd3b9eac103))
* **auth:** scope API keys and confine them to projects ([440ba29](https://github.com/Fishkob/visual-regression/commit/440ba291fa8c1fa3d83ee68a2239735307241b36))
* baseline overview and variant gallery for image tests ([#115](https://github.com/Fishkob/visual-regression/issues/115)) ([183112d](https://github.com/Fishkob/visual-regression/commit/183112d77e3ff92cae9c24ea01ed5a0417887bd2))
* **baselines:** retain and restore replaced baselines ([ed2a87b](https://github.com/Fishkob/visual-regression/commit/ed2a87b3c808e0c600d18b3736d28641ca9491e2))
* branch-scoped baselines ([#114](https://github.com/Fishkob/visual-regression/issues/114)) ([67a3ad7](https://github.com/Fishkob/visual-regression/commit/67a3ad7822c942858ff013c7a3f7531dd34287ce))
* **branches:** archive and delete a merged branch in one action ([d079f67](https://github.com/Fishkob/visual-regression/commit/d079f67f319954c3aed7b52b73621c8fbb470c07))
* **branches:** delete branches idle past a retention window ([93ee09f](https://github.com/Fishkob/visual-regression/commit/93ee09f3326455747dd0338a5f0a5c8889301f2c))
* **bulk:** add per-item approval, deletion and group moves ([c0f7606](https://github.com/Fishkob/visual-regression/commit/c0f7606d093d5bbc18278aedc70cd57972b96334))
* **ci:** gate the composite action on a run status ([927fda5](https://github.com/Fishkob/visual-regression/commit/927fda5aeaf4994607cc982ce6875404807d9b0d))
* **ci:** upload a manifest of captures in one run ([85de8de](https://github.com/Fishkob/visual-regression/commit/85de8deb160c71385e2c9d8677aa2ff0f367721c))
* **ci:** wait for queued comparisons and ship a GitHub Action ([5cf4bd2](https://github.com/Fishkob/visual-regression/commit/5cf4bd2c01ca44756e13e968684510c378c06601))
* **comparisons:** auto-accept image diffs within the baseline threshold ([714c33d](https://github.com/Fishkob/visual-regression/commit/714c33d6d68812249d8db0d4eed1fe35ddc7fb48))
* **config:** raise the rate-limit defaults ([333038f](https://github.com/Fishkob/visual-regression/commit/333038ffccdf52e1ebe55a6f8d077f4695b6be37))
* **db:** cache the project's evidence total for the quota check ([a40b9b6](https://github.com/Fishkob/visual-regression/commit/a40b9b6c2cd548020dc1c2072c4dbe778522ea3d))
* **deploy:** make image registry configurable ([11a4f8b](https://github.com/Fishkob/visual-regression/commit/11a4f8b7600fd60bc6f586641247fc5822f957f7))
* **deploy:** persist GHCR owner in values.local.yaml ([0828686](https://github.com/Fishkob/visual-regression/commit/0828686ca5bf9783ae564ebaa46e8ff4dd07695d))
* **deploy:** report the real build identity on /api/v1/health ([ed1bc51](https://github.com/Fishkob/visual-regression/commit/ed1bc51e4d48f42388f9c38a7bd0dba373eadf7f))
* **dev:** default local-dev admin login to admin/admin-secret ([46ce6b3](https://github.com/Fishkob/visual-regression/commit/46ce6b32eb963351f87cbe295921607b3910c94e))
* **frontend:** add API key scopes and project allowlists ([2c4bbc2](https://github.com/Fishkob/visual-regression/commit/2c4bbc2b621f6f68ce363ce74152f79fabcab110))
* **frontend:** add inbox bulk approval and project group moves ([52cd4ab](https://github.com/Fishkob/visual-regression/commit/52cd4ab29ddf5ddfffb013fc3d37eb7fff50b891))
* **frontend:** add overlay, wipe, fit-to-screen and fullscreen to the diff viewer ([b81125c](https://github.com/Fishkob/visual-regression/commit/b81125c000d920cedeb7fb98f879876aba5436fc))
* **frontend:** add run list, run detail and the inbox run filter ([61ffb3b](https://github.com/Fishkob/visual-regression/commit/61ffb3b8dee035bf780d553eca20c1a145e601bc))
* **frontend:** add run report downloads and the project trends page ([a265718](https://github.com/Fishkob/visual-regression/commit/a265718083dc4839c3337c87f432c3f3e44b42df))
* **frontend:** add test lifecycle editing and the inbox tag filter ([fdfc963](https://github.com/Fishkob/visual-regression/commit/fdfc963753c6ee36ae8e0f2651139ce3dba4ea42))
* **frontend:** add the global audit log page ([e8c80a3](https://github.com/Fishkob/visual-regression/commit/e8c80a322d277ebe9ce63ab4bf22268fa0f921f0))
* **frontend:** add the global search palette and recents ([666acd3](https://github.com/Fishkob/visual-regression/commit/666acd3198c5ce15bfeb833c036701a437ba72e9))
* **frontend:** add the public share page and share dialog ([7cc9b13](https://github.com/Fishkob/visual-regression/commit/7cc9b13b32c12974270366f303ed66dfec1b25c5))
* **frontend:** add the retention dry-run preview ([7ed3752](https://github.com/Fishkob/visual-regression/commit/7ed375209c44a873a907f0a6f43ce7756eb3149b))
* **frontend:** add theme quality guardrails ([#105](https://github.com/Fishkob/visual-regression/issues/105)) ([7f66f6e](https://github.com/Fishkob/visual-regression/commit/7f66f6e2ce7e0df723d2f230b40852acf35cfd6d))
* **frontend:** add two-step login and the security settings page ([6567537](https://github.com/Fishkob/visual-regression/commit/6567537e7029b394e4397fa3cde2e6cf0d6cd924))
* **frontend:** add users, role gates and forced password change ([3b0defb](https://github.com/Fishkob/visual-regression/commit/3b0defb2fcc6e2bd22ec329554ce7d7f44023b48))
* **frontend:** add webhook settings and the delivery log ([6b90cc1](https://github.com/Fishkob/visual-regression/commit/6b90cc17618fefc5d9ab8590b89df321941d6b7d))
* **frontend:** expose the per-test image size policy ([71ffe6c](https://github.com/Fishkob/visual-regression/commit/71ffe6c9c2ebc0a91f76cfdb8185edd3487d717c))
* **frontend:** refresh the review inbox live ([1606c57](https://github.com/Fishkob/visual-regression/commit/1606c5779bc6c605da2476488a06b0f0c82665fc))
* **frontend:** show baseline history and restore it from the review page ([85f8a69](https://github.com/Fishkob/visual-regression/commit/85f8a69f68e884708787881fed5e33cb7401a81f))
* **frontend:** show storage usage and edit retention settings ([611b7b3](https://github.com/Fishkob/visual-regression/commit/611b7b3b2228dab3992190d446fba1e63146f332))
* harden the worker and finish the threshold/share/review backlog ([9b0ae31](https://github.com/Fishkob/visual-regression/commit/9b0ae3152eb1e1a893660304b2fc9e2bbc5b6ad3))
* **i18n:** add English/German locales and the shell translations ([d6de656](https://github.com/Fishkob/visual-regression/commit/d6de6565fe6a3618847e2febc93d76382c67f3ec))
* **i18n:** add page and a11y keys, fix plurals and initial lang ([e346985](https://github.com/Fishkob/visual-regression/commit/e3469859db4f9d01e744e35a8a969c2762b29bf6))
* **i18n:** translate the inbox, projects and shared UI ([b58b480](https://github.com/Fishkob/visual-regression/commit/b58b4808033828320633d7233204f9a34cf558e4))
* **i18n:** translate the remaining views, panels and toasts ([7661cb0](https://github.com/Fishkob/visual-regression/commit/7661cb03c85bdcd0b00c97fd089cf9465681402b))
* **images:** accept JPEG/WebP and add per-test size policies ([682ab5a](https://github.com/Fishkob/visual-regression/commit/682ab5aa68f739c134c8f7eb36ef4ffb3c57f28f))
* mark where a comparison changed, not just how much ([0c74d74](https://github.com/Fishkob/visual-regression/commit/0c74d745efdf610b7b45960ca86b6efeeb2b7020))
* one-command self-hosting via ./install.sh ([671a7d2](https://github.com/Fishkob/visual-regression/commit/671a7d232bca7e61e97a6da943cf5304b51377ff))
* **overview:** give the comparison the whole window ([1ce1e23](https://github.com/Fishkob/visual-regression/commit/1ce1e2396c0d89a9683f2a13353a5a63a5d5b5d4))
* **overview:** two panes per row in fullscreen ([37c765d](https://github.com/Fishkob/visual-regression/commit/37c765d46b89c18c15d60f5d3588181d266be3df))
* presigned storage URLs and server-side list pagination ([8da3379](https://github.com/Fishkob/visual-regression/commit/8da3379753fc6020ad33299d42315dd256dabb6d))
* **projects:** expose and update required approvals ([f5a39b2](https://github.com/Fishkob/visual-regression/commit/f5a39b273c3cb89a4682e7f5fff6ce648e4975b2))
* **projects:** rename projects with audit history ([3976917](https://github.com/Fishkob/visual-regression/commit/397691785537d3b1cd2b5c65b24772ff2a19c8c9))
* **reports:** add run reports, outcome history and project trends ([1c271cb](https://github.com/Fishkob/visual-regression/commit/1c271cb6d20b6cfabaa05752004b09b87078ecfc))
* **reports:** expose the approval-reason mix in the trends read ([48fd576](https://github.com/Fishkob/visual-regression/commit/48fd576affa9060950b5ff34ee58b86ee7bd9d40))
* **reports:** include failed jobs and write the JUnit report from CI ([1753477](https://github.com/Fishkob/visual-regression/commit/17534777826c2fd651e7c4b71485a10f9b5f229e))
* **retention:** enforce per-project limits and add a dry-run preview ([760da9a](https://github.com/Fishkob/visual-regression/commit/760da9a24cb43d4721b75684dd6eee317f5fcbc7))
* review inbox and project groups ([#113](https://github.com/Fishkob/visual-regression/issues/113)) ([dc30aff](https://github.com/Fishkob/visual-regression/commit/dc30affc6946c7065a30f19c43e82df6c3652d25))
* **review:** add assignments, SLA data and 4-eyes approvals ([4fdb6f0](https://github.com/Fishkob/visual-regression/commit/4fdb6f0272556fd47c8db540d48ecfed0b2c7916))
* **review:** add comment threads and approval decision reasons UI ([f5101e9](https://github.com/Fishkob/visual-regression/commit/f5101e9289da0e3f31b9cbf7ae663fb43c3c02c9))
* **review:** add comment threads and structured approval reasons ([e81c902](https://github.com/Fishkob/visual-regression/commit/e81c902231140ceedf517ca6309cb3461b6e2ed3))
* **review:** add multi-approver votes for 4-eyes projects ([83d17d2](https://github.com/Fishkob/visual-regression/commit/83d17d2bae5694b6fd09d13526fe439f0ed7f22e))
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
* **security:** add pnpm production-dependency classifier ([752b19a](https://github.com/Fishkob/visual-regression/commit/752b19a49f9cbd74f4af48a6fbf19d9a0acbfec6))
* **security:** gate osv findings on production deps only ([b91447e](https://github.com/Fishkob/visual-regression/commit/b91447ee340bc789d398fc958829bacc746f30b4))
* **seeds:** add CI runs, project groups and varied demo screenshots ([3d5025f](https://github.com/Fishkob/visual-regression/commit/3d5025f4610469c2043fe22f9df251dc543102dc))
* **seeds:** give the demo one test per review state ([177475b](https://github.com/Fishkob/visual-regression/commit/177475ba965906ffc0d9547249b84033d2fa9a0e))
* **shares:** add expiring read-only share links ([3956eba](https://github.com/Fishkob/visual-regression/commit/3956eba641d7bfd159b4a8c1a4f3fb44708ffb53))
* **storage:** admin-gate and audit retention settings ([5494005](https://github.com/Fishkob/visual-regression/commit/5494005293854a51ba5fb165251953111b94a293))
* **storage:** backfill sizes for legacy objects ([d2f35b2](https://github.com/Fishkob/visual-regression/commit/d2f35b2b9e7250bc8c7de51276fbe9195d87006a))
* **storage:** charge the quota at the stored-write seam ([635ef91](https://github.com/Fishkob/visual-regression/commit/635ef91db7d20b6017d5644caddfc1a493a6f284))
* **storage:** track usage, enforce quotas and store retention settings ([631108a](https://github.com/Fishkob/visual-regression/commit/631108adb9c369ddb686f12c769dffb9cef1ae44))
* **test:** add test-ids for text-selected UI elements ([8fd37e1](https://github.com/Fishkob/visual-regression/commit/8fd37e1a62d70004eed487300c6840dd356c397d))
* **tests:** add rename, tags, mute and flake metadata ([3b78351](https://github.com/Fishkob/visual-regression/commit/3b783516b57ed3a1b9a2cc20a23acf2174118e02))
* unify rate limiting on scoped Postgres buckets ([ec786b3](https://github.com/Fishkob/visual-regression/commit/ec786b3eea304cfba81d339f1f004a05900f303e))
* **viewer:** two panes per row in fullscreen, hide a pane on demand ([497ce69](https://github.com/Fishkob/visual-regression/commit/497ce695904f1f7c8d6ec9257fba2128428d3acc))
* **web:** administer webhooks from the project settings page ([96cbb3a](https://github.com/Fishkob/visual-regression/commit/96cbb3abf074b652bbd017e7cf4ca0d9a4e15609))
* **web:** browse a test's variants by viewport, review one variant at a time ([2f67541](https://github.com/Fishkob/visual-regression/commit/2f675411ddc4c7d755bb8b2b3f83836627f04c98))
* **web:** compare the browsers of one viewport on the variant overview ([b794fec](https://github.com/Fishkob/visual-regression/commit/b794fec028435872aa4065249f362efce35a3dd3))
* **web:** drop the masked key hint from the API key list ([3cb514a](https://github.com/Fishkob/visual-regression/commit/3cb514abc176364bc57573c331afc0b6e5dbe983))
* **web:** give the review page a headline and grouped facts ([f9f69d7](https://github.com/Fishkob/visual-regression/commit/f9f69d70c43094826f539ba3a8c49e72e6bc7c29))
* **webhooks:** deliver signed review and approval events ([2b02b5a](https://github.com/Fishkob/visual-regression/commit/2b02b5a592f0fa9b04bb8987ddf14940fc759685))
* **web:** keep the review page frame while the next comparison loads ([cf1389b](https://github.com/Fishkob/visual-regression/commit/cf1389b9bbbdf9324d4e7a9654c1a1fc19700c1b))
* **web:** label sibling variants by the dimension that tells them apart ([6e2b7d8](https://github.com/Fishkob/visual-regression/commit/6e2b7d82d91c6428edcf00fb252a57e924d3a2c2))
* **web:** make the users page usable on a phone and close its dead ends ([4ea0ce7](https://github.com/Fishkob/visual-regression/commit/4ea0ce73593b1adb9214c66c33be4e0d6ec9d8af))
* **web:** move storage and review policy onto a project settings page ([2df66d9](https://github.com/Fishkob/visual-regression/commit/2df66d91607058c40296022d43a12d747bbb570b))
* **web:** page titles, branding, a11y labels and mobile navigation ([b7be676](https://github.com/Fishkob/visual-regression/commit/b7be67632535ca4b088ccf0c9fc3fbb276f3c501))
* **web:** put projects and groups on the shared page header ([ae11818](https://github.com/Fishkob/visual-regression/commit/ae1181856b45336bb5de35c72effc9eb8a5ecb19))
* **web:** rebuild the review trail below the comparison ([f2c2975](https://github.com/Fishkob/visual-regression/commit/f2c297538635b7e012fbf6d74a32bbe7e7fbea93))
* **web:** resolve the pending variant for variant-less test links ([b605fa7](https://github.com/Fishkob/visual-regression/commit/b605fa7a03bc137e40bf8f3fce936e7468bf7417))


### Bug Fixes

* **api:** type string arrays as flat arrays in the SDK ([f240847](https://github.com/Fishkob/visual-regression/commit/f24084728b01d87b9214b3bde4fff64c557b3368))
* **audit:** AuditEntry.action is the union of known actions ([05f5a77](https://github.com/Fishkob/visual-regression/commit/05f5a77efd4b7f5cc5dcc2a13c25d1e85a75272a))
* **audit:** document the paginated response and nullable string fields ([9ed6e1c](https://github.com/Fishkob/visual-regression/commit/9ed6e1c391869a1cd23f43ec96a72e85d5af9bca))
* **audit:** write the trail in the same transaction as the change ([027ff86](https://github.com/Fishkob/visual-regression/commit/027ff861c32af22e48b3aac0995e555888ba7075))
* **auth:** close the audit and offboarded-key gaps the ADR review exposed ([d131a0b](https://github.com/Fishkob/visual-regression/commit/d131a0b1fbcbe482b84d69d43ea72db408849a0e))
* **auth:** confine an allowlisted key to project routes ([87a6659](https://github.com/Fishkob/visual-regression/commit/87a6659a78f1ffb030d3c8f21e88ae66369df22e))
* **auth:** declare API-key scopes on the route ([3cd2576](https://github.com/Fishkob/visual-regression/commit/3cd25765b437b0b6e9b8537db957e3369ed562b3))
* **auth:** harden proxy trust, cookies, rate limits and 5xx ([bc599ee](https://github.com/Fishkob/visual-regression/commit/bc599ee75cfce36e88aa720115b7d850ac5361e2))
* **auth:** honour scopes on keys created via the admin endpoint ([6bad242](https://github.com/Fishkob/visual-regression/commit/6bad242d3c31b12b5a143ec2bfa4e6eec679e10c))
* **auth:** no fabricated actors, no path-substring exemption ([7d57da6](https://github.com/Fishkob/visual-regression/commit/7d57da69e432ce9a405ae365fc48bf68812d6df9))
* **auth:** one liveness rule, and an allowlist that covers the inbox ([eb3de2d](https://github.com/Fishkob/visual-regression/commit/eb3de2d9fb0a489354d7309a7b2444fee597471b))
* **auth:** type recovery codes as a string array ([2f62cc1](https://github.com/Fishkob/visual-regression/commit/2f62cc12d4a47b6bda54a983eaa4249573988841))
* **backend:** correct TypeScript config for root config files ([8c81cb1](https://github.com/Fishkob/visual-regression/commit/8c81cb1cd48d62819df7213cb5407aa14dbbec9c))
* **backend:** count only variant coordinates as variant filters ([213cc58](https://github.com/Fishkob/visual-regression/commit/213cc58976e6627ede33b1b09af0f531728b796d))
* **backend:** harden launch-blocking security and reliability gaps ([c076ad6](https://github.com/Fishkob/visual-regression/commit/c076ad692059245eb69675f89dfcc3f52a0a20d9))
* **backend:** harden security, reliability and data lifecycle ([b11b3cc](https://github.com/Fishkob/visual-regression/commit/b11b3cc8caa4f333e0163aecee615e845c6c3fd4))
* **backend:** serve the status a middleware attached to its error ([9fc325d](https://github.com/Fishkob/visual-regression/commit/9fc325d6cce9414315e329e6d005f0aba62f8947))
* **ci:** authenticate the frontend e2e health probes ([92a12da](https://github.com/Fishkob/visual-regression/commit/92a12da7e0b83a3edb62b9983d4b0f816118ae09))
* **ci:** install semgrep via pip to avoid Docker Hub rate limit ([e05bb9f](https://github.com/Fishkob/visual-regression/commit/e05bb9f9adce7cba54288eaed4fecdada8650603))
* **ci:** provide TOTP_ENCRYPTION_KEY to the test jobs ([331f963](https://github.com/Fishkob/visual-regression/commit/331f9630ec09b127b53fb6d1c0c1f540f2e40e97))
* **ci:** run quality image as non-root and pin Trivy v0.76.0 ([ae54a30](https://github.com/Fishkob/visual-regression/commit/ae54a308e8f4c7a7df18138ec1970d1189639419))
* **ci:** start the pdf sidecar for the backend e2e job ([d74e3e7](https://github.com/Fishkob/visual-regression/commit/d74e3e7f5aff7ca550c72346bac20bcfbe8e8cc8))
* **client-sdk:** make the documented Playwright reporter upload ([#16](https://github.com/Fishkob/visual-regression/issues/16)) ([3edb0ba](https://github.com/Fishkob/visual-regression/commit/3edb0ba3ee700418742499453caf61c648bd9bd2))
* **compose:** honor RUSTFS_PUBLIC_URL and harden runtime ([5833727](https://github.com/Fishkob/visual-regression/commit/583372743b858f50e2564af3d0c7c327abfb956b))
* **config:** allow empty METRICS_API_KEY so compose default does not crash backend ([6ce542d](https://github.com/Fishkob/visual-regression/commit/6ce542d70f338c651720431362573ed168970e52))
* **db:** add cleanup indexes, session sweep and chunked URL queries ([cb7ef75](https://github.com/Fishkob/visual-regression/commit/cb7ef7584a2877aed53c130c0767e79b1064589e))
* **db:** enforce cross-row identities and cascade review comments ([755ab51](https://github.com/Fishkob/visual-regression/commit/755ab51f88ec10a182a0d5203b8a18123ecbc632))
* **db:** enforce the schema's invariants and key projects by id ([8d3c1fe](https://github.com/Fishkob/visual-regression/commit/8d3c1fe3ad0d69fbcbd7f905da04c97b1b76e217))
* **deploy:** correct Helm image tags and align dev commands ([97540e2](https://github.com/Fishkob/visual-regression/commit/97540e2506b226beeb2057dede0ac245ed89ca36))
* **deploy:** make deploy.sh executable ([331d64a](https://github.com/Fishkob/visual-regression/commit/331d64a5cd51b81fd1f15ca6b806e71f29a9acdd))
* **deploy:** make setup-k3s.sh executable ([d59972f](https://github.com/Fishkob/visual-regression/commit/d59972f787e5994223125ad0e522e491a3c69f1d))
* **deps:** force patched lodash to clear production HIGH ([b9dcc07](https://github.com/Fishkob/visual-regression/commit/b9dcc07886d15751413d6f04fb2b74909b2d4810))
* **deps:** force patched versions of vulnerable transitive packages ([fc37bc5](https://github.com/Fishkob/visual-regression/commit/fc37bc50518893e3634a88e08ca4f7b054ee36f3))
* **deps:** move pnpm overrides to pnpm-workspace.yaml ([38f22dc](https://github.com/Fishkob/visual-regression/commit/38f22dc2979ce65733946824d267f54d7364a113))
* **dev:** make a fresh checkout boot, migrate and seed cleanly ([#104](https://github.com/Fishkob/visual-regression/issues/104)) ([33e9e04](https://github.com/Fishkob/visual-regression/commit/33e9e04e43686c85d22a3c6af28797fe2c945296))
* **docker:** copy tsconfig.node.json into backend build images ([f64cfbb](https://github.com/Fishkob/visual-regression/commit/f64cfbba569e1ee7fe50b1eb13f2e60ff359c430))
* **e2e:** complete the forced password change when logging in as admin ([c377c25](https://github.com/Fishkob/visual-regression/commit/c377c25ce190dfcbf8d1c8c9e03a0e4b26b2b730))
* **e2e:** drop @playwright/test tsconfig path mapping that broke ESM loading ([8007f7d](https://github.com/Fishkob/visual-regression/commit/8007f7d399e8e8cc8ccb1f5456cf4b69a527915b))
* **e2e:** replace the bootstrap admin's temporary password before the suite ([27b3ddd](https://github.com/Fishkob/visual-regression/commit/27b3ddd0d355c91177e68537c229ab18832b16a9))
* **frontend:** editor-resolve @/lib/test-ids in ct specs via tsconfig ([d40c39a](https://github.com/Fishkob/visual-regression/commit/d40c39a66a7f9cea8d00142ca8d71c7e6f5e97e8))
* **frontend:** keep inbox scope and fix project detail states ([731f177](https://github.com/Fishkob/visual-regression/commit/731f17782d932baed98dda35c8b37ad91a4fa069))
* **frontend:** make skip button visible in dark mode ([c7ae6fa](https://github.com/Fishkob/visual-regression/commit/c7ae6fada641d204b5c099930e91bffb2703e105))
* **frontend:** make the data table keyboard operable and fix badge contrast ([cb14a24](https://github.com/Fishkob/visual-regression/commit/cb14a24ca4458ae46f7da05443bff9e4a3b38b9e))
* **frontend:** resolve lint errors and generate coverage in CI ([c9851a5](https://github.com/Fishkob/visual-regression/commit/c9851a5b943ba1ee3c75060fac2144ae53e5e3c4))
* **frontend:** resolve type errors in e2e fixtures and eslint config ([7b4d29a](https://github.com/Fishkob/visual-regression/commit/7b4d29a753ef4a10d8546db07c3dda86a945fffd))
* **frontend:** respect dark mode in data table background ([b1439a5](https://github.com/Fishkob/visual-regression/commit/b1439a57b7f6c6e204cbc90267a8d5da59897685))
* **frontend:** return focus to the search trigger when the palette closes ([f872d93](https://github.com/Fishkob/visual-regression/commit/f872d9353f26bbafbf5b398cc5b88355bd68563d))
* **frontend:** surface pdf and image failures and split routes ([eca4715](https://github.com/Fishkob/visual-regression/commit/eca4715abea1a57db0018fa047a883dffb834162))
* **helm:** render backend deployment and bootstrap first admin ([960a03c](https://github.com/Fishkob/visual-regression/commit/960a03c361e97a2a465f576c84bb91f9d73606e7))
* mount Postgres volume at PG18 data root ([a1fb41c](https://github.com/Fishkob/visual-regression/commit/a1fb41cd931e8c4a3fe34a187942368293673f08))
* **observability:** add grafana alert rule folder and drop stale alloy.river ref ([faf8d6e](https://github.com/Fishkob/visual-regression/commit/faf8d6ebaba87af8fe6a626030537c10a12c3a57))
* **observability:** read metrics key from file, enable remote-write receiver ([3f95f89](https://github.com/Fishkob/visual-regression/commit/3f95f8956df6c55f9bda77e9dee3ea1de6e12320))
* **observability:** valid prometheus headers and alloy-syntax pipeline ([dcbe837](https://github.com/Fishkob/visual-regression/commit/dcbe83765cd121a296c2394409b4bd6a9d0d4566))
* **quality:** pin visual baselines to linux/amd64 ([61956c2](https://github.com/Fishkob/visual-regression/commit/61956c231aa163cadcd7dfdb775e0495d3c7d0fd))
* **query-seam:** surface SDK error responses as query errors ([efb8e67](https://github.com/Fishkob/visual-regression/commit/efb8e6780f183cde3b3ea7ed25d6f29f1cead0e6))
* **release:** keep the platform tag shape and split the release PRs ([#27](https://github.com/Fishkob/visual-regression/issues/27)) ([1a3199a](https://github.com/Fishkob/visual-regression/commit/1a3199aaa64410ed4585d8a0b57a44ce91114c32))
* **retention:** enforce each project's orphanGraceHours ([002a560](https://github.com/Fishkob/visual-regression/commit/002a5606fd94ed0552136dbb3388a05d017b2aec))
* **retention:** let a failed job keep its candidate ([8028c45](https://github.com/Fishkob/visual-regression/commit/8028c45dd9911a59cc904f4f29a76c39d5e9d1ec))
* **review:** close the gaps the approval-race investigation found ([2b3d9af](https://github.com/Fishkob/visual-regression/commit/2b3d9af1c25a67c39c16b3d67361f7f7210f3291))
* **review:** count only reviewable pending comparisons ([f065be5](https://github.com/Fishkob/visual-regression/commit/f065be547d9da89a0f66d818e7c60c8557f1979c))
* **review:** serialize concurrent approvals instead of letting them abort ([74e7ca4](https://github.com/Fishkob/visual-regression/commit/74e7ca4ce59ddae04e39318149832b0a622f46e3))
* **review:** size the approval retry budget for the legal voter count ([309496b](https://github.com/Fishkob/visual-regression/commit/309496bad9b8fa36d27f436cb52cd9617d0fa472))
* **review:** state the approval path's own retry budget ([7c8e022](https://github.com/Fishkob/visual-regression/commit/7c8e02295413088717df238c77fc154faea8460f))
* **review:** stop comments writing to an inherited test's ancestor ([3ff4434](https://github.com/Fishkob/visual-regression/commit/3ff44343b6dd8be2ce50f44ff0c11117b294f648))
* **review:** stop silent loss and tighten review UX ([95863a0](https://github.com/Fishkob/visual-regression/commit/95863a0aee726ba62fb41c5d9ad669b393c033f6))
* **runs:** a muted comparison is visible, never bulk-approved, and approves with 'approve' ([4db09f8](https://github.com/Fishkob/visual-regression/commit/4db09f83536a68e2517fb8bfb4207d639ad614b5))
* **runs:** one RunState rule for the gate, the share page and the reports ([5f15405](https://github.com/Fishkob/visual-regression/commit/5f154058756b2e7db19d8e63169afb4bea87d3fe))
* **scripts:** name only the checks the gate actually skipped ([2ca74dd](https://github.com/Fishkob/visual-regression/commit/2ca74dde3c006cf7622359dbeacddb966dc06fae))
* **scripts:** regenerate the prisma client before the gate reads it ([27f2e22](https://github.com/Fishkob/visual-regression/commit/27f2e2220578b631e3a2986f4c23bb317fba550e))
* **sdk:** gate the npm publish on a step output, not the step's own env ([#19](https://github.com/Fishkob/visual-regression/issues/19)) ([a6a963b](https://github.com/Fishkob/visual-regression/commit/a6a963bfa681b745d416d5a6b2b76bef0e5434fe))
* **sdk:** hand the npm token to the registry with an explicit userconfig ([#23](https://github.com/Fishkob/visual-regression/issues/23)) ([ea31162](https://github.com/Fishkob/visual-regression/commit/ea311623abebb97fe96cac41556fb186cd726497))
* **sdk:** publish the gate's tarball instead of versioning and rebuilding ([#20](https://github.com/Fishkob/visual-regression/issues/20)) ([4f82e1c](https://github.com/Fishkob/visual-regression/commit/4f82e1c6cb5a6b35a78a82f0be0633c11f556842))
* **sdk:** type the nullable baseline-history columns in the schema ([384ec1c](https://github.com/Fishkob/visual-regression/commit/384ec1c967bdb0c2ef4a5fb2b8afadbf99daab58))
* **search:** keep archived branches out and name the Branch View exception ([14a41be](https://github.com/Fishkob/visual-regression/commit/14a41be7846c356b355615cc0e36a739dbcc0534))
* **security:** fail closed when pnpm lockfile lacks an importers section ([30d9ae4](https://github.com/Fishkob/visual-regression/commit/30d9ae47ff0708b2d6069649018e202fe9e4a745))
* **security:** patch high-severity dependency advisories ([dc9b9b4](https://github.com/Fishkob/visual-regression/commit/dc9b9b47d3a6296f130d2fcb5a0ee93cbf649a3e))
* **security:** summarize every counted severity in osv-gate ([4d5be0a](https://github.com/Fishkob/visual-regression/commit/4d5be0a2c00ed96d49ee5ee21424e761eaba3664))
* **seeds:** give demo branch candidates the baseline dimensions ([#131](https://github.com/Fishkob/visual-regression/issues/131)) ([f1942c9](https://github.com/Fishkob/visual-regression/commit/f1942c96d3b6dbf5f0d4b7d8acf60815cc7289f0))
* **seeds:** give demo branch candidates the baseline dimensions ([#4](https://github.com/Fishkob/visual-regression/issues/4)) ([4a5eb8b](https://github.com/Fishkob/visual-regression/commit/4a5eb8b2c07362dc60b0e7c8ac142d0842bb30d3))
* **storage:** filter stale URLs at the seam that deletes ([86dc2a7](https://github.com/Fishkob/visual-regression/commit/86dc2a72a57042009d5ff3616263e1d942ffe5e1))
* **storage:** name the effective grace for what it is ([00bbfd7](https://github.com/Fishkob/visual-regression/commit/00bbfd7a37592764db46e00bbeb009c70b028908))
* **threshold-editor:** parse numeric v-model value on blur ([892be8b](https://github.com/Fishkob/visual-regression/commit/892be8b635073ae25e406228c2e6b8de1f7040d5))
* **upload:** cap decoded image pixels and pdf pages ([1ce7b8f](https://github.com/Fishkob/visual-regression/commit/1ce7b8fa84280c0300db1a519813da48c6ad4a67))
* **web:** close the approval decision dialog and repair review-loop CTs ([851cc1c](https://github.com/Fishkob/visual-regression/commit/851cc1c96788c8f9820b2b043bbf0b19de4dfee9))
* **web:** frame the comparison surface with the picture ([1d070d0](https://github.com/Fishkob/visual-regression/commit/1d070d04bb6431b05dadcc8da3b83f5ea21b392e))
* **web:** keep the changed-region number readable in dark mode ([c4c8b1e](https://github.com/Fishkob/visual-regression/commit/c4c8b1e9ee83a1fcdd55e76b9b36d95f398f2b5e))
* **web:** keep the chosen 1:1/fit resting state after a zoom round trip ([2c6e968](https://github.com/Fishkob/visual-regression/commit/2c6e968dbefe2b660faba1feb1b7fb2b539a70b1))
* **web:** name audit targets and label project pending counts ([b85a0e7](https://github.com/Fishkob/visual-regression/commit/b85a0e762c9c47ae1b401b25fab427742ae62e18))


### Performance Improvements

* **db:** cut round-trips and unbounded reads on the hot paths ([c47baa4](https://github.com/Fishkob/visual-regression/commit/c47baa4961beddf701803adf094b9b7b3cc3ede0))
* **db:** index the substring searches and the webhook outbox sweep ([aecd484](https://github.com/Fishkob/visual-regression/commit/aecd48427d1a03d15cc5e47c2715710465145229))


### Reverts

* remove the approval-reason mix from the trends read ([e63b101](https://github.com/Fishkob/visual-regression/commit/e63b101f72811518cec89ba36e20b8586a436a3e))

## [4.0.0](https://github.com/Fishkob/visual-regression/compare/v3.5.0...v4.0.0) (2026-11-07)


### Miscellaneous Chores

* reset the release line to 4.0.0; no functional change since 3.5.0 ([ADR-070](docs/adr/ADR-070-release-baseline-reset.md))

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
