import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
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
  requireUserActor,
} from '@common/http/authenticated-principal';
import { SessionOnly } from '@common/http/session-only.decorator';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { ReviewCommentService } from '@public/visualTest/review/application/review-comment.service';
import {
  CommentDto,
  CreateCommentDto,
  ListCommentsQueryDto,
  ResolveCommentQueryDto,
} from '@public/visualTest/review/presentation/dto/comment.dto';

@ApiTags('Review comments')
@Controller('projects/:projectName/tests/:testName/comments')
@SessionOnly()
export class ReviewCommentController {
  constructor(private readonly comments: ReviewCommentService) {}

  @Get()
  @ApiOperation({
    summary: 'List review comments for a test or comparison (paged by cursor)',
  })
  @ApiOkResponse({ type: [CommentDto] })
  async list(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query() query: ListCommentsQueryDto,
  ): Promise<CommentDto[]> {
    const rows = await this.comments.list(projectName, testName, {
      comparisonId: query.comparisonId,
      branch: query.branch,
      before: query.before,
      limit: query.limit,
    });
    return plainToInstance(CommentDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Add a review comment' })
  @ApiCreatedResponse({ type: CommentDto })
  async create(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() dto: CreateCommentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommentDto> {
    const row = await this.comments.create(
      projectName,
      testName,
      { body: dto.body, comparisonId: dto.comparisonId, branch: dto.branch },
      requireUserActor(req),
    );
    return plainToInstance(CommentDto, row, {
      excludeExtraneousValues: true,
    });
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve a review comment' })
  @ApiOkResponse({ type: CommentDto })
  async resolve(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Param('id') id: string,
    @Query() query: ResolveCommentQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommentDto> {
    const row = await this.comments.resolve(
      projectName,
      testName,
      id,
      requireActor(req),
      query.branch,
    );
    return plainToInstance(CommentDto, row, {
      excludeExtraneousValues: true,
    });
  }
}
