import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { BranchTestRepository } from '@public/visualTest/core/infrastructure/repositories/branch-test.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { ApprovalAuditRepository } from '@public/visualTest/core/infrastructure/repositories/approval-audit.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { VariantStore } from '@public/visualTest/core/infrastructure/repositories/variant-store';
import { OrphanedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/orphaned-screenshot.repository';
import { StorageObjectReferencednessService } from '@public/visualTest/core/infrastructure/repositories/storage-object-referencedness.service';
import { STORAGE_OBJECT_REFERENCEDNESS } from '@common/domain/storage-referencedness.interface';
import { ORPHAN_SWEEP } from '@common/domain/orphan-sweep.interface';

@Module({
  imports: [PrismaModule],
  providers: [
    ProjectRepository,
    BranchRepository,
    BranchTestRepository,
    UnifiedTestRepository,
    UnifiedScreenshotRepository,
    UnifiedComparisonsRepository,
    ApprovalAuditRepository,
    BaselineRevisionRepository,
    RunRepository,
    VariantStore,
    OrphanedScreenshotRepository,
    StorageObjectReferencednessService,
    {
      provide: STORAGE_OBJECT_REFERENCEDNESS,
      useExisting: StorageObjectReferencednessService,
    },
    {
      provide: ORPHAN_SWEEP,
      useExisting: OrphanedScreenshotRepository,
    },
  ],
  exports: [
    ProjectRepository,
    BranchRepository,
    BranchTestRepository,
    UnifiedTestRepository,
    UnifiedScreenshotRepository,
    UnifiedComparisonsRepository,
    ApprovalAuditRepository,
    BaselineRevisionRepository,
    RunRepository,
    VariantStore,
    OrphanedScreenshotRepository,
    STORAGE_OBJECT_REFERENCEDNESS,
    ORPHAN_SWEEP,
  ],
})
export class VisualTestInfraModule {}
