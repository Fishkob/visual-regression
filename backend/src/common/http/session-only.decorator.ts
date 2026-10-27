import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';

export const IS_SESSION_ONLY_KEY = 'isSessionOnly';

// Narrows the global AuthenticationGuard to the browser-session credential. An
// api key passes the guard (it is a valid product credential) but must not be
// able to escalate: key management grants permanent access, so a leaked CI key
// that could mint, rotate, or revoke keys would be a privilege escalation. The
// guard already knows which credential authenticated the request, so it rejects
// the api key path here instead of a second guard re-deriving it.
// The ApiCookieAuth decorator keeps the OpenAPI document honest: these routes
// accept the session cookie, not the x-api-key header that the document-wide
// security requirement advertises.
//
// A session-only route declares NO `@Scope(...)`: the guard rejects the api key
// before it ever reads the scope, so the declaration would describe a decision
// that cannot happen. Seven auth routes carried one anyway — metadata promising
// a check nobody performs is worse than no metadata, because the next reader
// reasons from it. `auth.controller.spec.ts` pins the rule.
export const SessionOnly = () =>
  applyDecorators(
    SetMetadata(IS_SESSION_ONLY_KEY, true),
    ApiCookieAuth('sessionCookie'),
  );
