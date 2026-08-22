import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { Request } from 'express';

export interface ApiKeyAuthOptions {
  header: string;
  getApiKey: (appConfig: AppConfigService) => string;
  disabledMessage: string;
  invalidMessage: string;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly options: ApiKeyAuthOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const apiKey = this.options.getApiKey(this.appConfig);

    if (!apiKey) {
      throw new UnauthorizedException(this.options.disabledMessage);
    }

    const request = context.switchToHttp().getRequest<Request>();
    const headerKey = request.headers[this.options.header];

    if (typeof headerKey !== 'string' || headerKey !== apiKey) {
      throw new UnauthorizedException(this.options.invalidMessage);
    }

    return true;
  }
}
