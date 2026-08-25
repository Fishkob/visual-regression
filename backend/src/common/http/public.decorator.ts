import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'isPublic';

// Opt-out for the global AuthenticationGuard. The global guard defaults every
// other endpoint to protected, so a new route is authenticated unless a
// reviewer consciously marks it public.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Combined opt-out for the global AuthenticationGuard and the global apiKeyAuth
// swagger requirement. Used by endpoints that are reachable before (or without)
// a product session or api key: health, metrics, log ingestion, the login route
// and the admin endpoints (protected by their own AdminAuthGuard). The empty
// ApiSecurity requirement object = anonymous access, overriding the global
// apiKeyAuth default on the document.
export const PublicEndpoint = () => applyDecorators(Public(), ApiSecurity({}));
