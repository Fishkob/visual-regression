# Roles and permissions

The authoritative matrix for human roles. The API enforces it in the global
authentication guard (ADR-031); the UI mirrors it by hiding controls.

| Action                                             | ADMIN |       MEMBER       | VIEWER |
| -------------------------------------------------- | :---: | :----------------: | :----: |
| Read projects, tests, runs, reports, trends, audit |  yes  |        yes         |  yes   |
| Upload captures                                    |  yes  |        yes         |   no   |
| Approve comparisons / restore baselines            |  yes  |        yes         |   no   |
| Delete tests/variants                              |  yes  |        yes         |   no   |
| Create/update branches, groups, webhooks           |  yes  | yes (webhooks: no) |   no   |
| Delete projects/branches                           |  yes  |         no         |   no   |
| Webhook settings, audit log                        |  yes  |         no         |   no   |
| API keys                                           |  yes  |         no         |   no   |
| Users and roles                                    |  yes  |         no         |   no   |

Notes:

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
  revokes every session and issues a fresh one.

Security settings (`/settings/security`) are available to every authenticated
user: 2FA enrollment/disable and the user's own session list. Admins cannot see
or revoke another user's sessions; they use a password reset instead.

Enforcement points:

- Backend: `AuthenticationGuard` (role resolution, `@Roles('ADMIN')`,
  viewer-write rule, password-change gate).
- Frontend: `useCurrentRole()` / role-gated routes and nav; hidden controls are
  convenience only, not security.
