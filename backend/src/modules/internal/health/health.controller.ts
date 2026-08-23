import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  type BuildInfo,
  DetailedHealthDto,
  HealthCheckResult,
} from './health.types';
import { HealthChecker } from './health-checker.service';
@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly checker: HealthChecker) {}

  @Get()
  @ApiOkResponse({
    description: 'All systems operational',
    type: DetailedHealthDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'One or more systems are unhealthy',
    type: DetailedHealthDto,
  })
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailedHealthDto> {
    return this.#executeCheck(res);
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
    return this.#executeCheck(res);
  }

  async #executeCheck(res: Response): Promise<DetailedHealthDto> {
    const { checks, errors, warnings } = await this.checker.checkAll();
    const response = this.checker.buildResponse(checks, errors, warnings);
    if (response.status === 'unhealthy') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return response;
  }

  @Get('db')
  @ApiOkResponse({ description: 'Database connection is healthy' })
  @ApiServiceUnavailableResponse({ description: 'Database unavailable' })
  async checkDatabase(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthCheckResult> {
    return this.#runCheck(res, 'database');
  }

  @Get('storage')
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
