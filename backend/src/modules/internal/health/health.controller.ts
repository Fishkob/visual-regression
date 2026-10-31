import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PublicEndpoint } from '@common/http/public.decorator';
import { MetricsAuthGuard } from '@internal/metrics/metrics-auth.guard';
import {
  type BuildInfo,
  DetailedHealthDto,
  HealthCheckResult,
} from './health.types';
import { HealthChecker } from './health-checker.service';

// Two audiences, two contracts:
//
//   - `/health/live` and `/health/ready` are the orchestrator probes. They must
//     stay anonymous (a kubelet has no key) and must not describe the internals,
//     so the readiness body carries statuses only — no error strings, endpoints
//     or timings.
//   - `/health`, `/health/db` and `/health/storage` are operator diagnostics and
//     require the metrics key, the same credential the monitoring already uses.
//     They report the raw probe error, which can name an internal host.
@ApiTags('Health')
@PublicEndpoint()
@Controller('health')
export class HealthController {
  constructor(private readonly checker: HealthChecker) {}

  @Get()
  @UseGuards(MetricsAuthGuard)
  @ApiHeader({
    name: 'x-metrics-key',
    required: true,
    description: 'Same key as the /metrics endpoint',
  })
  @ApiOkResponse({
    description: 'All systems operational',
    type: DetailedHealthDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'One or more systems are unhealthy',
    type: DetailedHealthDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing metrics key' })
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailedHealthDto> {
    return this.#executeCheck(res, { verbose: true });
  }

  @Get('live')
  @ApiExcludeEndpoint()
  @ApiOkResponse({ description: 'Liveness probe' })
  liveness(): { status: string; timestamp: string; buildInfo: BuildInfo } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      buildInfo: this.checker.getBuildInfoData(),
    };
  }

  @Get('ready')
  @ApiOkResponse({
    description: 'Application ready to serve traffic',
    type: DetailedHealthDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Application not ready',
    type: DetailedHealthDto,
  })
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailedHealthDto> {
    return this.#executeCheck(res, { verbose: false });
  }

  async #executeCheck(
    res: Response,
    options: { verbose: boolean },
  ): Promise<DetailedHealthDto> {
    const { checks, errors, warnings } = await this.checker.checkAll();
    const response = this.checker.buildResponse(checks, errors, warnings);
    if (response.status === 'unhealthy') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return options.verbose ? response : withoutInternals(response);
  }

  @Get('db')
  @UseGuards(MetricsAuthGuard)
  @ApiHeader({
    name: 'x-metrics-key',
    required: true,
    description: 'Same key as the /metrics endpoint',
  })
  @ApiOkResponse({ description: 'Database connection is healthy' })
  @ApiServiceUnavailableResponse({ description: 'Database unavailable' })
  async checkDatabase(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthCheckResult> {
    return this.#runCheck(res, 'database');
  }

  @Get('storage')
  @UseGuards(MetricsAuthGuard)
  @ApiHeader({
    name: 'x-metrics-key',
    required: true,
    description: 'Same key as the /metrics endpoint',
  })
  @ApiOkResponse({ description: 'RustFS storage is available' })
  @ApiServiceUnavailableResponse({ description: 'RustFS unavailable' })
  async checkStorage(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthCheckResult> {
    return this.#runCheck(res, 'storage');
  }

  async #runCheck(res: Response, name: string): Promise<HealthCheckResult> {
    const result = await this.checker.runCheck(name);
    if (result.status === 'error') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}

// Keeps the shape (statuses, version, uptime) but drops everything that
// describes the deployment: probe messages, details, and the per-check timing.
function withoutInternals(response: DetailedHealthDto): DetailedHealthDto {
  const checks = Object.fromEntries(
    Object.entries(response.checks).map(([name, result]) => [
      name,
      { status: result.status },
    ]),
  );
  // Rebuilt field by field (not spread): the DTO is a class instance, and a
  // spread would drop its prototype.
  return {
    status: response.status,
    results: response.results,
    timestamp: response.timestamp,
    version: response.version,
    buildInfo: response.buildInfo,
    uptime: response.uptime,
    checks,
    // `errors`/`warnings` are check names, which is what a probe consumer needs
    // to see which dependency is down; the raw messages stay in the verbose view.
    ...(response.warnings ? { warnings: response.warnings } : {}),
    ...(response.errors ? { errors: response.errors } : {}),
  };
}
