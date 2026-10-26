import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { BranchQuery } from '@common/http/branch-query.decorator';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
import { TestLifecycleService } from '@public/visualTest/review/application/test-lifecycle.service';
import {
  TestMetadataDto,
  UpdateTestMetadataDto,
} from '@public/visualTest/review/presentation/dto/test-lifecycle.dto';

@ApiTags('Tests')
@Controller('projects/:projectName/tests/:testName/metadata')
export class TestLifecycleController {
  constructor(private readonly lifecycle: TestLifecycleService) {}

  @Scope('read')
  @Get()
  @ApiOperation({
    summary: 'Read rename/tags/mute metadata and the 30-day flake signal',
  })
  @ApiOkResponse({ type: TestMetadataDto })
  async get(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @BranchQuery() branch?: string,
  ): Promise<TestMetadataDto> {
    const metadata = await this.lifecycle.get(projectName, testName, branch);
    return plainToInstance(TestMetadataDto, metadata, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Patch()
  @ApiOperation({
    summary: 'Rename a test, edit description/tags or mute it until a date',
  })
  @ApiOkResponse({ type: TestMetadataDto })
  async update(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Body() dto: UpdateTestMetadataDto,
    @Req() req: AuthenticatedRequest,
    @BranchQuery() branch?: string,
  ): Promise<TestMetadataDto> {
    const metadata = await this.lifecycle.update(
      projectName,
      testName,
      dto,
      req.auth?.username,
      branch,
    );
    return plainToInstance(TestMetadataDto, metadata, {
      excludeExtraneousValues: true,
    });
  }
}
