import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { StorageModule } from '@internal/storage/storage.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { ProjectGroupRepository } from '@public/visualTest/review/infrastructure/repositories/project-group.repository';
import { ReviewInboxRepository } from '@public/visualTest/review/infrastructure/repositories/review-inbox.repository';
import { ProjectsController } from '@public/visualTest/review/presentation/controllers/projects.controller';
import { ProjectGroupsController } from '@public/visualTest/review/presentation/controllers/project-groups.controller';
import { ApprovalsController } from '@public/visualTest/review/presentation/controllers/approvals.controller';
import { TestsQueriesController } from '@public/visualTest/review/presentation/controllers/tests-queries.controller';
import { PdfController } from '@public/visualTest/review/presentation/controllers/pdf.controller';
import { TestCommandsController } from '@public/visualTest/review/presentation/controllers/test-commands.controller';
import { ReviewInboxController } from '@public/visualTest/review/presentation/controllers/review-inbox.controller';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import { ProjectGroupService } from '@public/visualTest/review/application/project-group.service';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { PdfAccessService } from '@public/visualTest/review/application/pdf-access.service';
import { ReviewInboxService } from '@public/visualTest/review/application/review-inbox.service';
import { PdfSidecarModule } from '@internal/pdf-sidecar/pdf-sidecar.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
    PdfSidecarModule,
  ],
  controllers: [
    ProjectsController,
    ProjectGroupsController,
    ApprovalsController,
    TestsQueriesController,
    PdfController,
    TestCommandsController,
    ReviewInboxController,
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
  ],
})
export class ReviewModule {}
