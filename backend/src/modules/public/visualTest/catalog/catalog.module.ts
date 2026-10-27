import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
import { AuditModule } from '@internal/audit/audit.module';
import { StorageModule } from '@internal/storage/storage.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { ProjectsController } from '@public/visualTest/catalog/presentation/controllers/projects.controller';
import { ProjectGroupsController } from '@public/visualTest/catalog/presentation/controllers/project-groups.controller';
import { BranchesController } from '@public/visualTest/catalog/presentation/controllers/branches.controller';
import { SearchController } from '@public/visualTest/catalog/presentation/controllers/search.controller';
import { ProjectService } from '@public/visualTest/catalog/application/project.service';
import { ProjectGroupService } from '@public/visualTest/catalog/application/project-group.service';
import { BranchCommandService } from '@public/visualTest/catalog/application/branch-command.service';
import { SearchService } from '@public/visualTest/catalog/application/search.service';
import { ProjectGroupRepository } from '@public/visualTest/catalog/infrastructure/repositories/project-group.repository';
import { ProjectReadRepository } from '@public/visualTest/catalog/infrastructure/repositories/project-read.repository';
import { BranchReadRepository } from '@public/visualTest/catalog/infrastructure/repositories/branch-read.repository';
import { SearchRepository } from '@public/visualTest/catalog/infrastructure/repositories/search.repository';

// The catalog: what exists and where it lives — Project, Group, Branch and the
// global search that finds a materialized test by name. Named after the nouns
// CONTEXT.md already uses, so "which module owns a Project?" has an answer.
@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    StorageModule,
    AuditModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
  ],
  controllers: [
    ProjectsController,
    ProjectGroupsController,
    BranchesController,
    SearchController,
  ],
  providers: [
    ProjectService,
    ProjectGroupService,
    BranchCommandService,
    SearchService,
    ProjectGroupRepository,
    ProjectReadRepository,
    BranchReadRepository,
    SearchRepository,
  ],
  exports: [ProjectService, ProjectReadRepository, BranchReadRepository],
})
export class CatalogModule {}
