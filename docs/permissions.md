# Roles and permissions

The authoritative matrix for human roles. The API enforces it in the global
authentication guard (ADR-031); the UI mirrors it by hiding controls.

| Action                                             | ADMIN |       MEMBER       | VIEWER |
| -------------------------------------------------- | :---: | :----------------: | :----: |
| Read projects, tests, runs, reports, trends, audit |  yes  |        yes         |  yes   |
| Upload captures                                    |  yes  |        yes         |   no   |
| Approve comparisons / restore baselines            |  yes  |        yes         |   no   |
| Change pixel default or per-variant threshold      |  yes  |         no         |   no   |
| Assign reviews, complete own assignment            |  yes  |        yes         |   no   |
| Comment / resolve review threads                   |  yes  |        yes         |   no   |
| Delete tests/variants                              |  yes  |        yes         |   no   |
| Create/update branches, groups, webhooks           |  yes  | yes (webhooks: no) |   no   |
| Delete projects/branches                           |  yes  |         no         |   no   |
| Webhook settings, audit log                        |  yes  |         no         |   no   |
| API keys                                           |  yes  |         no         |   no   |
| Users and roles                                    |  yes  |         no         |   no   |

Notes:

- **Approval** finalizes a comparison on one approval, from a session or an API
  key with the `approve` scope. There is no approval quorum.
- **Pixel thresholds** are admin-only and audited (`project.pixel-threshold`,
  `test.threshold`); a per-variant threshold raise can auto-accept pending
  comparisons, which is why the threshold surfaces are a governance decision
  rather than a normal project edit. The project default applies prospectively
  to future comparisons, not to already pending rows. A repository config
  (`.vrt.json`) can set or tighten a variant threshold but cannot raise it.
- **API keys** have their own scopes, never the owner's role. Default is
  `upload` (upload + own job status); `read`, `approve` and `admin` are opt-in.
  An optional project allowlist confines the key to those project routes.
  `admin` grants project/branch deletion and other writes but `@SessionOnly`
  still blocks users, API keys, webhooks and audit. Existing keys keep their
  previous upload/read/approve capabilities.
- **VIEWER** is read-only globally: every non-GET request returns `403`, with
  the exception of `/auth/logout` and `/auth/change-password`.
- **Temporary password**: `mustChangePassword` blocks every route except
  `/auth/*` until the user changes it.
- **Last admin**: the last active admin cannot be demoted/deactivated; admins
  cannot deactivate themselves.
- Sessions are revoked on deactivation and password reset; changing a password
  revokes every session and issues a fresh one. Deactivation also revokes the API
  keys the user owns, so a long-lived CI credential cannot outlive its account.

Security settings (`/settings/security`) are available to every authenticated
user: the user's own session list. Admins cannot see or revoke another user's
sessions; they use a password reset instead.

Enforcement points:

- Backend: `AuthenticationGuard` (role resolution, `@Roles('ADMIN')`,
  viewer-write rule, password-change gate).
- Frontend: `useCurrentRole()` / role-gated routes and nav; hidden controls are
  convenience only, not security.
