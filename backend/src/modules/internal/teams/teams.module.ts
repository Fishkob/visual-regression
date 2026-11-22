import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AuditModule } from '@internal/audit/audit.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { TeamsController } from '@internal/teams/teams.controller';
import { ProjectTeamController } from '@internal/teams/project-team.controller';
import { TeamsRepository } from '@internal/teams/teams.repository';
import { TeamsService } from '@internal/teams/teams.service';
import { ProjectScopeService } from '@internal/teams/project-scope.service';

// `VisualTestInfraModule` is imported for `ProjectRepository` alone — the one
// writer of `Project.teamId`. That is the ADR-013 §1 exception internal modules
// already use for repository classes, not a licence to import application
// services (ADR-081).
@Module({
  imports: [PrismaModule, AuditModule, VisualTestInfraModule],
  controllers: [TeamsController, ProjectTeamController],
  providers: [TeamsService, TeamsRepository, ProjectScopeService],
  exports: [TeamsService, TeamsRepository, ProjectScopeService],
})
export class TeamsModule {}
