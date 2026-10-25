import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '@common/http/authenticated-request';

// Webhook administration is a browser-session capability. An API key is a CI
// credential and must not be able to register or edit an endpoint (it could
// exfiltrate every review notification). Until roles land (R9), every logged-in
// operator is effectively an admin.
@Injectable()
export class SessionOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth?.apiKeyId) {
      throw new ForbiddenException(
        'Webhook settings require a browser session',
      );
    }
    return true;
  }
}
