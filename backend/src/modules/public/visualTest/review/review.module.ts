import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
import { AuthModule } from '@internal/auth/auth.module';
import { StorageModule } from '@internal/storage/storage.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { ProjectGroupRepository } from '@public/visualTest/review/infrastructure/repositories/project-group.repository';
import { ReviewInboxRepository } from '@public/visualTest/review/infrastructure/repositories/review-inbox.repository';
import { BranchReadRepository } from '@public/visualTest/review/infrastructure/repositories/branch-read.repository';
import { ProjectsController } from '@public/visualTest/review/presentation/controllers/projects.controller';
import { ProjectGroupsController } from '@public/visualTest/review/presentation/controllers/project-groups.controller';
import { ApprovalsController } from '@public/visualTest/review/presentation/controllers/approvals.controller';
import { TestsQueriesController } from '@public/visualTest/review/presentation/controllers/tests-queries.controller';
import { PdfController } from '@public/visualTest/review/presentation/controllers/pdf.controller';
import { TestCommandsController } from '@public/visualTest/review/presentation/controllers/test-commands.controller';
import { ReviewInboxController } from '@public/visualTest/review/presentation/controllers/review-inbox.controller';
import { BranchesController } from '@public/visualTest/review/presentation/controllers/branches.controller';
import { BaselineHistoryController } from '@public/visualTest/review/presentation/controllers/baseline-history.controller';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import { ProjectGroupService } from '@public/visualTest/review/application/project-group.service';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { PdfAccessService } from '@public/visualTest/review/application/pdf-access.service';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { BranchCommandService } from '@public/visualTest/review/application/branch-command.service';
import { PdfSidecarModule } from '@internal/pdf-sidecar/pdf-sidecar.module';
import { WebhooksModule } from '@internal/webhooks/webhooks.module';
import { AuditModule } from '@internal/audit/audit.module';
import { RunsController } from '@public/visualTest/review/presentation/controllers/runs.controller';
import { RunService } from '@public/visualTest/review/application/run.service';
import { WebhooksController } from '@public/visualTest/review/presentation/controllers/webhooks.controller';
import { WebhookSettingsService } from '@public/visualTest/review/application/webhook-settings.service';
import { TrendsController } from '@public/visualTest/review/presentation/controllers/trends.controller';
import { TrendsService } from '@public/visualTest/review/application/trends.service';
import { BulkActionService } from '@public/visualTest/review/application/bulk-action.service';
import { TestLifecycleService } from '@public/visualTest/review/application/test-lifecycle.service';
import { TestLifecycleController } from '@public/visualTest/review/presentation/controllers/test-lifecycle.controller';
import { SearchController } from '@public/visualTest/review/presentation/controllers/search.controller';
import { SearchService } from '@public/visualTest/review/application/search.service';
import { SearchRepository } from '@public/visualTest/review/infrastructure/repositories/search.repository';
import { StorageController } from '@public/visualTest/review/presentation/controllers/storage.controller';
import { RetentionPreviewService } from '@public/visualTest/review/application/retention-preview.service';
import { ShareLinkService } from '@public/visualTest/review/application/share-link.service';
import { ShareLinkRepository } from '@public/visualTest/review/infrastructure/repositories/share-link.repository';
import {
  PublicShareController,
  ShareLinkRevokeController,
  ShareLinksController,
} from '@public/visualTest/review/presentation/controllers/share-link.controller';
import {
  BulkActionsController,
  ProjectsBulkController,
} from '@public/visualTest/review/presentation/controllers/bulk-actions.controller';

@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    AuthModule,
    StorageModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
    PdfSidecarModule,
    WebhooksModule,
    AuditModule,
  ],
  controllers: [
    ProjectsController,
    ProjectGroupsController,
    ApprovalsController,
    TestsQueriesController,
    PdfController,
    TestCommandsController,
    ReviewInboxController,
    BranchesController,
    BaselineHistoryController,
    WebhooksController,
    RunsController,
    TrendsController,
    BulkActionsController,
    ProjectsBulkController,
    TestLifecycleController,
    SearchController,
    StorageController,
    ShareLinksController,
    ShareLinkRevokeController,
    PublicShareController,
  ],
  providers: [
    TestQueryService,
    ProjectService,
    ProjectGroupService,
    TestCommandService,
    ApprovalService,
    PdfAccessService,
    ReviewInboxService,
    TestReadRepository,
    ProjectReadRepository,
    ProjectGroupRepository,
    ReviewInboxRepository,
    BranchReadRepository,
    BranchCommandService,
    WebhookSettingsService,
    RunService,
    TrendsService,
    BulkActionService,
    TestLifecycleService,
    SearchService,
    SearchRepository,
    RetentionPreviewService,
    ShareLinkService,
    ShareLinkRepository,
  ],
})
export class ReviewModule {}
