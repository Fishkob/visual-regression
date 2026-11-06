import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
import { AuditModule } from '@internal/audit/audit.module';
import { AuthModule } from '@internal/auth/auth.module';
import { StorageModule } from '@internal/storage/storage.module';
import { PdfSidecarModule } from '@internal/pdf-sidecar/pdf-sidecar.module';
import { WebhooksModule } from '@internal/webhooks/webhooks.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { CatalogModule } from '@public/visualTest/catalog/catalog.module';
import { ApprovalsController } from '@public/visualTest/review/presentation/controllers/approvals.controller';
import { AssignmentController } from '@public/visualTest/review/presentation/controllers/assignment.controller';
import { BaselineHistoryController } from '@public/visualTest/review/presentation/controllers/baseline-history.controller';
import {
  BulkActionsController,
  ProjectsBulkController,
} from '@public/visualTest/review/presentation/controllers/bulk-actions.controller';
import { ReviewCommentController } from '@public/visualTest/review/presentation/controllers/comment.controller';
import { ReviewInboxController } from '@public/visualTest/review/presentation/controllers/review-inbox.controller';
import { TestCommandsController } from '@public/visualTest/review/presentation/controllers/test-commands.controller';
import { TestLifecycleController } from '@public/visualTest/review/presentation/controllers/test-lifecycle.controller';
import { TestsQueriesController } from '@public/visualTest/review/presentation/controllers/tests-queries.controller';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { BulkActionService } from '@public/visualTest/review/application/bulk-action.service';
import { ReviewAssignmentService } from '@public/visualTest/review/application/review-assignment.service';
import { ReviewCommentService } from '@public/visualTest/review/application/review-comment.service';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import { TestLifecycleService } from '@public/visualTest/review/application/test-lifecycle.service';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { ReviewAssignmentRepository } from '@public/visualTest/review/infrastructure/repositories/review-assignment.repository';
import { ReviewCommentRepository } from '@public/visualTest/review/infrastructure/repositories/review-comment.repository';
import { ReviewInboxRepository } from '@public/visualTest/review/infrastructure/repositories/review-inbox.repository';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';

// The review loop: the Inbox, approving or skipping a comparison, the votes and
// reasons that record a decision, the comments and assignments around it, and
// the per-test reads a reviewer works from. A Run's approve-all reuses
// `ApprovalService` through this module's export rather than re-implementing the
// batch.
@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    StorageModule,
    AuditModule,
    AuthModule,
    PdfSidecarModule,
    WebhooksModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
    CatalogModule,
  ],
  controllers: [
    ApprovalsController,
    AssignmentController,
    BaselineHistoryController,
    BulkActionsController,
    ProjectsBulkController,
    ReviewCommentController,
    ReviewInboxController,
    TestCommandsController,
    TestLifecycleController,
    TestsQueriesController,
  ],
  providers: [
    ApprovalService,
    BulkActionService,
    ReviewAssignmentService,
    ReviewAssignmentRepository,
    ReviewCommentService,
    ReviewCommentRepository,
    ReviewInboxService,
    ReviewInboxRepository,
    TestCommandService,
    TestLifecycleService,
    TestQueryService,
    TestReadRepository,
  ],
  exports: [ApprovalService, TestQueryService, TestReadRepository],
})
export class ReviewModule {}
