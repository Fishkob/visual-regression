import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { StorageModule } from '@internal/storage/storage.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { TestReadRepository } from '@public/visualTest/review/infrastructure/repositories/test-read.repository';
import { ProjectReadRepository } from '@public/visualTest/review/infrastructure/repositories/project-read.repository';
import { ProjectsController } from '@public/visualTest/review/presentation/controllers/projects.controller';
import { ApprovalsController } from '@public/visualTest/review/presentation/controllers/approvals.controller';
import { TestsQueriesController } from '@public/visualTest/review/presentation/controllers/tests-queries.controller';
import { PdfController } from '@public/visualTest/review/presentation/controllers/pdf.controller';
import { TestCommandsController } from '@public/visualTest/review/presentation/controllers/test-commands.controller';
import { TestQueryService } from '@public/visualTest/review/application/test-query.service';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { PdfAccessService } from '@public/visualTest/review/application/pdf-access.service';
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
    ApprovalsController,
    TestsQueriesController,
    PdfController,
    TestCommandsController,
  ],
  providers: [
    TestQueryService,
    ProjectService,
    TestCommandService,
    ApprovalService,
    PdfAccessService,
    TestReadRepository,
    ProjectReadRepository,
  ],
})
export class ReviewModule {}
