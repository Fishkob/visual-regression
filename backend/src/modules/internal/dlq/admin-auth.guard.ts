import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { ApiKeyAuthGuard } from '@common/http/api-key-auth.guard';

@Injectable()
export class AdminAuthGuard extends ApiKeyAuthGuard {
  constructor(appConfig: AppConfigService) {
    super(appConfig, {
      header: 'x-admin-key',
      getApiKey: (config) => config.admin.apiKey,
      disabledMessage:
        'Admin endpoint is disabled until ADMIN_API_KEY is configured',
      invalidMessage: 'Invalid or missing admin API key',
    });
  }
}
