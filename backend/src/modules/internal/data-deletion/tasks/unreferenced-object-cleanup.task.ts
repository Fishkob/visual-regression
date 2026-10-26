import { Inject, Injectable } from '@nestjs/common';
import { isPdfRenderObject } from '@internal/pdf-sidecar/pdf-render-path';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
  BUCKET_LIST_TIMEOUT_MS,
} from '@common/domain/storage-provider.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { METRICS } from '@common/domain/metrics-catalog';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import {
  STORAGE_OBJECT_REFERENCEDNESS,
  IStorageObjectReferencedness,
} from '@common/domain/storage-referencedness.interface';
import {
  DEFAULT_ORPHAN_GRACE_HOURS,
  HOUR_MS,
} from '@common/domain/orphan-sweep.interface';

// A store→commit orphan window lasts milliseconds, so the default grace leaves
// crashed in-flight stores/uploads ample margin while still reclaiming objects
// the DB will never reference again. A per-project `orphanGraceHours` cannot
// apply here: an object with no row has no project to read it from, so this
// window stays global and the per-project knob governs row-level orphans.
const UNREFERENCED_OBJECT_MAX_AGE_MS = DEFAULT_ORPHAN_GRACE_HOURS * HOUR_MS;

// The sweep lists the ENTIRE bucket (empty prefix), which can exceed the 30s
// per-operation cap on a realistically large bucket. Give the listing a
// maintenance-scale budget so the task reclaims orphans instead of dying before
// deleting anything. The per-page streaming is still bounded by the 30s cap for
// the other callers that list a single namespace.

@Injectable()
export class UnreferencedObjectCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.unreferencedObjectCleanup;
  readonly label = 'unreferenced object cleanup';

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @Inject(STORAGE_OBJECT_REFERENCEDNESS)
    private readonly referencedness: IStorageObjectReferencedness,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const objects = await this.storage.listObjectsWithLastModified(
      '',
      BUCKET_LIST_TIMEOUT_MS,
    );
    const ageThreshold = new Date(Date.now() - UNREFERENCED_OBJECT_MAX_AGE_MS);

    const candidateUrls = objects
      .filter(
        (object) =>
          !isPdfRenderObject(object.name) &&
          object.lastModified !== null &&
          object.lastModified < ageThreshold,
      )
      .map((object) => this.storage.toPublicUrl(object.name));

    let deleted = 0;
    if (candidateUrls.length > 0) {
      const referenced = new Set(
        await this.referencedness.findReferencedUrls(candidateUrls),
      );
      let unreferencedUrls = candidateUrls.filter(
        (url) => !referenced.has(url),
      );

      // Re-check the unreferenced predicate immediately before the delete to
      // narrow the window for a reference that committed since the first scan.
      // Unlike the sibling orphan sweep (whose predicate lives inside the same
      // DELETE statement, evaluated against one snapshot), this re-check is NOT
      // atomic with the delete — a reference can still land between the second
      // check and deleteAll. It only shrinks the race, it does not close it;
      // the 24h age floor keeps the residual window acceptable.
      if (unreferencedUrls.length > 0) {
        const stillReferenced = new Set(
          await this.referencedness.findReferencedUrls(unreferencedUrls),
        );
        unreferencedUrls = unreferencedUrls.filter(
          (url) => !stillReferenced.has(url),
        );
      }

      if (unreferencedUrls.length > 0) {
        const result = await this.storage.deleteAll(unreferencedUrls);
        if (result.failed.length > 0) {
          this.logger.warn(
            `Failed to delete ${result.failed.length} unreferenced storage objects (retained for next run): ${result.failed.map((f) => f.url).join(', ')}`,
          );
        }
        deleted = result.deleted.length;
      }
    }

    return {
      counters: [
        { name: METRICS.cleanupUnreferencedObjectsTotal, value: deleted },
      ],
      gauges: [
        { name: METRICS.cleanupUnreferencedObjectsLastRun, value: Date.now() },
      ],
    };
  }
}
