import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
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

@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
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
  ],
})
export class ReviewModule {}
