import { INestApplication } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ComparisonJobProcessor } from '@public/visualTest/intake/workers/comparison-job-processor';
import type { QueuedJob } from '@common/domain/job-queue.interface';
import type { JobData } from '@common/domain/job-data.types';
import type { VariantFilter } from '@public/visualTest/core/domain/value-objects/variant.vo';
import request from 'supertest';
import { authRequest } from './authenticated-request';

const TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 200;

/**
 * Processes any pending comparison jobs for the given visualTestId, then polls
 * the test details endpoint until the comparison data appears.
 *
 * This replaces the sync gateway pattern — instead of overriding the gateway
 * to run comparisons inline, we let the real gateway enqueue a DB job and
 * then process it here, approximating what the background poller does.
 */
export async function waitForComparison(
  app: INestApplication,
  projectName: string,
  testName: string,
  filters: VariantFilter = {
    viewport: '1920x1080',
    browser: 'Chrome',
    environment: 'staging',
  },
  branch?: string,
): Promise<request.Response> {
  const start = Date.now();
  const query = { ...filters, ...(branch ? { branch } : {}) };

  while (Date.now() - start < TIMEOUT_MS) {
    const res = await authRequest(app)
      .get(`/api/v1/projects/${projectName}/tests/${testName}`)
      .query(query);

    if (res.status === 200 && res.body.comparison) {
      return res;
    }

    // PDF tests are served by the pdf-details read (the image details endpoint
    // rejects them with 400). Fall back to it so PDF e2e specs can wait for
    // their comparison the same way image specs do.
    if (res.status === 400) {
      const pdfRes = await authRequest(app)
        .get(`/api/v1/projects/${projectName}/tests/${testName}/pdf-details`)
        .query(query);
      if (pdfRes.status === 200 && pdfRes.body.comparison) {
        return pdfRes;
      }
    }

    const db = app.get(PrismaConnection).client;
    const pendingJobs = await db.comparisonJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingJobs.length > 0) {
      const processor = app.get(ComparisonJobProcessor);

      for (const job of pendingJobs) {
        const queueJob: QueuedJob = {
          id: job.id,
          payload: job.payload as unknown as JobData,
        };
        await processor.processJob(queueJob);
        await db.comparisonJob
          .delete({ where: { id: job.id } })
          .catch(() => undefined);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timed out waiting for comparison after upload (${projectName}/${testName})`,
  );
}
