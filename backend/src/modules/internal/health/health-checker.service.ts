import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { PrismaConnection } from '@/prisma/prisma-connection';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { JOB_QUEUE, IJobQueue } from '@common/domain/job-queue.interface';
import { probe, httpEndpointHealthCheck } from './health-probe';
import type { HealthCheckResult } from '@common/domain/health-result.type';
import type { BuildInfo, DetailedHealthDto } from './health.types';
import type { WorkerHealthPayload } from '@common/domain/worker-health.type';

interface CheckResult {
  checks: Record<string, HealthCheckResult>;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class HealthChecker {
  private readonly startTime = Date.now();
  private readonly buildInfo: BuildInfo;

  constructor(
    private readonly connection: PrismaConnection,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @Inject(JOB_QUEUE) private readonly jobQueue: IJobQueue,
    private readonly appConfig: AppConfigService,
  ) {
    this.buildInfo = this.loadBuildInfo(appConfig);
  }

  private loadBuildInfo(appConfig: AppConfigService): BuildInfo {
    return {
      version: appConfig.appVersion.version,
      commitHash: appConfig.appVersion.gitCommit,
      buildTime: appConfig.appVersion.buildTime,
      nodeVersion: process.version,
    };
  }

  getBuildInfoData(): BuildInfo {
    return this.buildInfo;
  }

  calculateStatus(
    errors: string[],
    warnings: string[],
  ): 'ok' | 'degraded' | 'unhealthy' {
    if (errors.length > 0) return 'unhealthy';
    if (warnings.length > 0) return 'degraded';
    return 'ok';
  }

  buildResponse(
    checks: Record<string, HealthCheckResult>,
    errors: string[],
    warnings: string[],
  ): DetailedHealthDto {
    const overallStatus = this.calculateStatus(errors, warnings);

    const results: Record<string, unknown> = {};
    for (const [name, check] of Object.entries(checks)) {
      results[name] = check.status;
    }

    const response: DetailedHealthDto = {
      status: overallStatus,
      results,
      timestamp: new Date().toISOString(),
      version: this.buildInfo.version,
      buildInfo: this.buildInfo,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(errors.length > 0 ? { errors } : {}),
    };

    return response;
  }

  async checkAll(): Promise<CheckResult> {
    const entries = Object.entries(this.checks);
    const results = await Promise.all(entries.map(([, check]) => check()));

    const checks: Record<string, HealthCheckResult> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const name = entries[i][0];
      const result = results[i];
      checks[name] = result;
      if (result.status === 'error') errors.push(name);
      if (result.status === 'degraded') warnings.push(name);
    }

    return { checks, errors, warnings };
  }

  async runCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks[name];
    if (!check) {
      return {
        status: 'skipped',
        message: `Health check "${name}" not configured`,
      };
    }
    return check();
  }

  // The set of health checks is one data structure, so checkAll and runCheck
  // cannot drift — a check added here shows up in both without editing a
  // parallel names array or a switch.
  private readonly checks: Record<string, () => Promise<HealthCheckResult>> = {
    database: () => this.checkDatabase(),
    storage: () => this.checkStorage(),
    queues: () => this.checkQueues(),
    worker: () => this.checkWorker(),
    'pdf-sidecar': () => this.checkPdfSidecar(),
  };

  private async checkDatabase(): Promise<HealthCheckResult> {
    const result = await probe(() => this.connection.$queryRaw`SELECT 1`, {
      timeoutMs: 5000,
    });
    if (result.ok) {
      return { status: 'ok', latencyMs: result.elapsedMs };
    }
    return {
      status: 'error',
      latencyMs: result.elapsedMs,
      message: result.error,
    };
  }

  private async checkStorage(): Promise<HealthCheckResult> {
    const result = await probe(() => this.storage.healthCheck(), {
      timeoutMs: 5000,
    });
    if (result.ok) {
      return { status: 'ok', latencyMs: result.elapsedMs };
    }
    return {
      status: 'error',
      latencyMs: result.elapsedMs,
      message: result.error,
    };
  }

  private async checkQueues(): Promise<HealthCheckResult> {
    const result = await probe(() => this.jobQueue.healthCheck(), {
      timeoutMs: 5000,
    });
    if (!result.ok) {
      return {
        status: 'error',
        latencyMs: result.elapsedMs,
        message: 'Queue check failed',
        details: { error: result.error },
      };
    }
    const stats = result.value;
    const details = {
      pending: stats.pending,
      processing: stats.processing,
      failed: stats.failed,
    };

    if (stats.failed > 100) {
      return {
        status: 'degraded',
        latencyMs: result.elapsedMs,
        message: `High number of failed jobs: ${stats.failed}`,
        details,
      };
    }

    return { status: 'ok', latencyMs: result.elapsedMs, details };
  }

  private async checkWorker(): Promise<HealthCheckResult> {
    const workerUrl = this.appConfig.workerHealth.url;
    if (!workerUrl) {
      return { status: 'skipped', message: 'Worker health URL not configured' };
    }
    return httpEndpointHealthCheck(workerUrl, {
      name: 'Worker',
      healthyStatus: 'ok',
      statusFromBody: (body) => {
        const status = (body as unknown as WorkerHealthPayload).status;
        return typeof status === 'string' ? status : undefined;
      },
      details: (body) => {
        const data = body as unknown as WorkerHealthPayload;
        return {
          uptime: data.uptime,
          lastJobProcessedAt: data.lastJobProcessedAt,
          lastPollAt: data.lastPollAt,
          jobsProcessed: data.jobsProcessed,
        };
      },
    });
  }

  private async checkPdfSidecar(): Promise<HealthCheckResult> {
    const healthUrl = this.appConfig.pdfSidecar.healthUrl;
    if (!healthUrl) {
      return { status: 'skipped', message: 'PDF sidecar URL not configured' };
    }
    return httpEndpointHealthCheck(healthUrl, {
      name: 'PDF sidecar',
      healthyStatus: 'UP',
      statusFromBody: (body) =>
        typeof body.status === 'string' ? body.status : undefined,
    });
  }
}
