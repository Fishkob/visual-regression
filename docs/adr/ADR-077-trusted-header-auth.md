# ADR 077: A Trusting Proxy May Supply the Identity

## Status

Accepted — 2026-11-12. Amends [ADR-025](./025-authentication.md) with a third
credential beside the session cookie and the API key; it removes neither and adds
no dependency. Closes the "SSO beyond an IdP proxy in front" deferral of the
roadmap, in the only shape ADR-025 leaves open.

Enforced by: `AUTH_TRUSTED_HEADER` (`config/env.validation.ts`),
`AppConfigService.auth.trustedHeader`, `AuthenticationGuard.resolveTrustedIdentity`.

## Context

ADR-025 authenticates in the app with two credentials and no external identity
provider, because the platform is self-hosted in private networks. That leaves a
deployment which already runs an authenticating proxy — oauth2-proxy, an IdP
sidecar, an ingress with auth annotations — with a second identity store to
maintain: the proxy knows who called, the API still asks for a password.

The roadmap named this as the one SSO shape worth supporting: the proxy
authenticates, the API trusts the header it sets. The alternative inside the app
(OIDC/SAML) stays out of scope.

The hard part is not reading the header; it is that a header is only a credential
if nothing else can set it. That is a deployment fact, so the decision has to make
the opt-in explicit and state what the deployment owes in return.

## Decision

- **Opt-in through the environment, empty means off.** `AUTH_TRUSTED_HEADER` names
  a single header (`x-auth-request-user` is the oauth2-proxy spelling). It
  defaults to empty, and the guard then never reads a header. Nothing infers "a
  proxy is in front" from `TRUST_PROXY` or from the request.
- **The header names a user the installation already has.** The value is a
  username, resolved through `AuthRepository.findUserByUsername`. It must exist and
  be active; otherwise the answer is the same `401` a wrong password gets, so the
  header cannot be used to probe which usernames exist. There is no
  auto-provisioning: a header that could create an account is an account-minting
  surface, and it would need a claim→role mapping the product does not own.
- **The user's stored role governs, exactly like a session.** `@Roles`,
  the global `VIEWER` write ban, project scoping and the API-key allowlist logic
  apply unchanged. The credential attaches `{ userId, username, role }` from the
  user row; it is not the API-key path and does not go through `@Scope`.
- **An API key wins over the header.** Precedence is session cookie → API key →
  trusted header. A proxy that stamps the header on everything it forwards also
  stamps it on a CI job's key call; letting the header win would drop that key's
  scopes and project allowlist and give the key the human's reach. The session
  stays first so a browser that also holds a cookie keeps sliding expiry and the
  session list.
- **It is session-equivalent for authorization.** `@SessionOnly()` means "not an
  API key" and it passes: a browser authenticated by the proxy is a browser. The
  same-origin check on unsafe methods applies as well — a proxy authenticates the
  browser, so a cross-site form post to the dashboard arrives with the header
  attached and with no `SameSite` cookie behind it.
- **`mustChangePassword` is ignored for this credential.** The local password is
  not part of the credential, so an unfinished invite link must not lock a user
  out of the dashboard their proxy just authenticated.
- **No new route and no contract change.** `GET /auth/me` answers from
  `request.auth` as before, so the dashboard needs no change and the client SDK is
  untouched. Signing out of the proxy's session is the proxy's job; the app's
  logout still clears only its own cookie.

## Consequences

- **The deployment must keep the API unreachable around the proxy.** A forged
  header is a login, so the exposure rule is part of turning the feature on: the
  proxy strips any inbound copy of the header it sets, and the backend is
  reachable only through it (network policy, ingress-only Service). Documented in
  [deployment.md](../deployment.md#trusted-header-authentication-auth_trusted_header).
- The header user has **no session row**: no sliding expiry, no session list, no
  in-app revocation. The proxy's session is the session. Deactivating the user row
  still locks them out (`isActive` is checked per request), so deactivation stays
  the kill switch.
- **Every identity still needs a row.** A deployment whose IdP holds every user
  must create them (invite link or `POST /users`) before the proxy's users can
  work. That is the explicit-users stance of ADR-025, and it is also what keeps a
  header from making someone an admin.
- Rate limits still key on `req.ip`, so `TRUST_PROXY` stays required behind the
  proxy for the login and log buckets.
- Two sources of identity can disagree: a user the proxy authenticates is refused
  as soon as the dashboard marks them inactive. That asymmetry is deliberate — the
  app owns authorization.

## Alternatives Considered

- **OIDC/SAML client inside the app.** Adds a dependency and the surface ADR-025
  refused; still out of scope. Rejected.
- **Auto-provision on an email/group claim.** Turns the header into account
  creation and requires owning a claim→role mapping. Rejected for now; it is the
  natural next step if a deployment's IdP holds users the dashboard has never
  seen.
- **Trust the header unconditionally.** Makes every deployment that forgot the
  exposure rule an open door, and no config says whether a proxy is in front.
  Rejected.
- **Sign the header with a shared secret.** A per-user credential with
  shared-secret management; the network boundary is the control deployments
  actually have. Rejected.
