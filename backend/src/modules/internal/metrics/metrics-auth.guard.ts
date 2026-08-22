import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { ApiKeyAuthGuard } from '@common/http/api-key-auth.guard';

// The one home for the "metrics endpoint requires the metrics API key" rule:
// header name, the comparison semantics, and the disabled case. Both HTTP
// surfaces that serve metrics cross this — the Nest guard on the API /metrics
// route and the worker health server's bare /metrics handler — so a change to
// the convention lands in one place.
export const METRICS_API_KEY_HEADER = 'x-metrics-key';

export function isValidMetricsApiKey(
  headerValue: string | string[] | undefined,
  apiKey: string,
): boolean {
  return typeof headerValue === 'string' && headerValue === apiKey;
}

export function hasMetricsApiKey(apiKey: string): boolean {
  return apiKey.length > 0;
}

@Injectable()
export class MetricsAuthGuard extends ApiKeyAuthGuard {
  constructor(appConfig: AppConfigService) {
    super(appConfig, {
      header: METRICS_API_KEY_HEADER,
      getApiKey: (config) => config.metrics.apiKey,
      disabledMessage:
        'Metrics endpoint is disabled until METRICS_API_KEY is configured',
      invalidMessage: 'Invalid or missing metrics API key',
    });
  }
}
