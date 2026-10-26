import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import { VariantFilterDto } from '@public/visualTest/review/presentation/dto/variant.dto';
import { UpdateThresholdResultDto } from '@public/visualTest/review/presentation/dto/review-responses.dto';
import {
  UpdateThresholdDto,
  UpdateThresholdQueryDto,
} from '@public/visualTest/review/presentation/dto/project.dto';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Roles } from '@common/http/roles.decorator';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';

@ApiTags('Tests')
@Controller('projects/:projectName/tests')
export class TestCommandsController {
  constructor(private readonly testCommand: TestCommandService) {}

  @Roles('ADMIN')
  @Scope('admin')
  @Patch(':testName/threshold')
  @ApiOperation({ summary: 'Update pixelDiffThreshold for a specific variant' })
  @ApiQuery({ name: 'viewport', required: false })
  @ApiQuery({ name: 'browser', required: false })
  @ApiQuery({ name: 'environment', required: false })
  @ApiQuery({
    name: 'preview',
    required: false,
    description:
      'When true, returns how many pending comparisons the value would auto-accept without mutating anything',
  })
  @ApiBody({ type: UpdateThresholdDto })
  @ApiOkResponse({ type: UpdateThresholdResultDto })
  async updateThreshold(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() body: UpdateThresholdDto,
    @Query() query: UpdateThresholdQueryDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ) {
    const result = await this.testCommand.updateThreshold(
      testName,
      projectName,
      body.threshold,
      query,
      query.preview === 'true',
      branch,
      req.auth?.username,
    );
    return plainToInstance(UpdateThresholdResultDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Delete(':testName')
  @ApiOperation({
    summary:
      'Delete a visual test or a specific variant if filters are provided',
  })
  @ApiOkResponse({ description: 'Deleted' })
  @ApiQuery({ name: 'viewport', required: false })
  @ApiQuery({ name: 'browser', required: false })
  @ApiQuery({ name: 'environment', required: false })
  deleteVisualTest(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query() filters: VariantFilterDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ) {
    return this.testCommand.deleteTest(
      projectName,
      testName,
      branch,
      filters,
      req.auth?.username,
    );
  }
}
