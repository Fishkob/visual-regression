import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import {
  requireActor,
  requireProjectScope,
  requireUserActor,
} from '@common/http/authenticated-principal';
import { SessionOnly } from '@common/http/session-only.decorator';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { ProjectScoped } from '@common/http/project-route.decorator';
import { ProjectSpanning } from '@common/http/project-route.decorator';
import { ReviewAssignmentService } from '@public/visualTest/review/application/review-assignment.service';
import {
  AssignmentDto,
  AssignmentListQueryDto,
  CreateAssignmentDto,
} from '@public/visualTest/review/presentation/dto/assignment.dto';

@ApiTags('Assignments')
@Controller()
@SessionOnly()
export class AssignmentController {
  constructor(private readonly assignments: ReviewAssignmentService) {}

  @Post('projects/:projectName/assignments')
  @ApiOperation({ summary: 'Assign a test or run to a reviewer' })
  @ProjectScoped()
  @ApiCreatedResponse({ type: AssignmentDto })
  async create(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: CreateAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AssignmentDto> {
    const assignment = await this.assignments.create(
      projectName,
      dto,
      requireActor(req),
    );
    return plainToInstance(AssignmentDto, assignment, {
      excludeExtraneousValues: true,
    });
  }

  @Get('assignments/mine')
  @ApiOperation({ summary: 'List my open review assignments' })
  @ProjectSpanning()
  @ApiOkResponse({ type: [AssignmentDto] })
  async mine(
    @Query() query: AssignmentListQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AssignmentDto[]> {
    const { id: userId } = requireUserActor(req);
    const rows = await this.assignments.mine(
      userId,
      query.includeCompleted ?? false,
      requireProjectScope(req),
    );
    return plainToInstance(AssignmentDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  @Get('assignments/mine/overdue')
  @ApiOperation({ summary: 'List my overdue review assignments' })
  @ProjectSpanning()
  @ApiOkResponse({ type: [AssignmentDto] })
  async overdue(@Req() req: AuthenticatedRequest): Promise<AssignmentDto[]> {
    const { id: userId } = requireUserActor(req);
    const rows = await this.assignments.overdue(
      userId,
      requireProjectScope(req),
    );
    return plainToInstance(AssignmentDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  @Post('assignments/:id/complete')
  @ApiOperation({ summary: 'Mark my assignment complete' })
  @ProjectScoped()
  @ApiOkResponse({ type: AssignmentDto })
  async complete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AssignmentDto> {
    const actor = requireUserActor(req);
    const row = await this.assignments.complete(actor.id, id, actor.username);
    return plainToInstance(AssignmentDto, row, {
      excludeExtraneousValues: true,
    });
  }
}
