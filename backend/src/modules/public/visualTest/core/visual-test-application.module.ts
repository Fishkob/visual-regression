import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { StorageModule } from '@internal/storage/storage.module';
import { JobQueueModule } from '@internal/job-queue/job-queue.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { BranchBaselineResolver } from '@public/visualTest/core/application/services/branch-baseline-resolver.service';
import { BranchResolver } from '@public/visualTest/core/application/services/branch-resolver.service';
import { BranchDeletionService } from '@public/visualTest/core/application/services/branch-deletion.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { TestStatusService } from '@public/visualTest/core/application/services/test-status.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { ComparisonRetirementService } from '@public/visualTest/core/application/services/comparison-retirement.service';
import { CandidateReclamationService } from '@public/visualTest/core/application/services/candidate-reclamation.service';
import { StateChangeWorkflow } from '@public/visualTest/core/application/services/state-change-workflow.service';
import { ThresholdUpdateService } from '@public/visualTest/core/application/services/threshold-update.service';

@Module({
  imports: [VisualTestInfraModule, PrismaModule, StorageModule, JobQueueModule],
  providers: [
    BranchBaselineResolver,
    BranchDeletionService,
    BranchResolver,
    TestResolver,
    TestStatusService,
    TestDeletionService,
    ComparisonRetirementService,
    CandidateReclamationService,
    StateChangeWorkflow,
    ThresholdUpdateService,
  ],
  exports: [
    BranchBaselineResolver,
    BranchDeletionService,
    BranchResolver,
    TestResolver,
    TestDeletionService,
    ComparisonRetirementService,
    CandidateReclamationService,
    StateChangeWorkflow,
    ThresholdUpdateService,
  ],
})
export class VisualTestApplicationModule {}
