import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from '@common/http/pipes/file-validation.pipe';
import { TestKindValidationPipe } from '@common/http/pipes/test-kind-validation.pipe';
import { assertNever } from '@common/utils/assert-never';
import { UploadIntake } from '@public/visualTest/intake/application/upload-intake.service';
import type { TestKind } from '@common/domain/test-kind';
import { TEST_KINDS } from '@common/domain/test-kind';
import {
  BaselineCreatedResultDto,
  ComparisonQueuedResultDto,
  IdenticalResultDto,
  UploadDocumentDto,
} from '@public/visualTest/intake/presentation/dto/upload.dto';
import { ProjectTestNameValidationPipe } from '@common/http/pipes/project-testname-validation.pipe';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import type { AnyUploadResult } from '@common/domain/unified-upload-result.type';
import { ComparisonOutcome } from '@common/domain/upload-outcome';
import { RateLimit } from '@internal/rate-limit/rate-limit.decorator';

@ApiTags('Upload')
@RateLimit('upload')
@ApiExtraModels(
  BaselineCreatedResultDto,
  IdenticalResultDto,
  ComparisonQueuedResultDto,
)
@Controller('projects/:projectName/tests')
export class UploadController {
  constructor(private readonly uploadIntake: UploadIntake) {}

  @Post(':testName/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiSecurity('apiKeyAuth')
  @ApiOperation({
    summary: 'Upload a file (image or PDF) and compare with the baseline',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'File and upload parameters' })
  @ApiQuery({
    name: 'testKind',
    required: true,
    enum: TEST_KINDS,
    description: 'Kind of test (image or pdf)',
  })
  @ApiOkResponse({
    description: 'Upload result (identical, baseline created, or queued)',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(IdenticalResultDto) },
        { $ref: getSchemaPath(BaselineCreatedResultDto) },
        { $ref: getSchemaPath(ComparisonQueuedResultDto) },
      ],
    },
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiBadRequestResponse({ description: 'Invalid file type or upload data' })
  @ApiTooManyRequestsResponse({
    description: 'Per-key upload rate limit exceeded',
  })
  async upload(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Param('testName', ProjectTestNameValidationPipe) testName: string,
    @Query('testKind', TestKindValidationPipe) testKind: TestKind,
    // eslint-disable-next-line @darraghor/nestjs-typed/uploaded-file-should-be-validated -- size limit set on MulterModule, mime/signature validated in FileValidationPipe
    @UploadedFile(FileValidationPipe)
    file: Express.Multer.File,
    @Body() body: UploadDocumentDto,
  ) {
    const result = await this.uploadIntake.upload(
      {
        projectName,
        testName,
        viewport: body.viewport,
        browser: body.browser,
        environment: body.environment,
        file,
      },
      testKind,
    );
    return this.toDto(result);
  }

  private toDto(
    result: AnyUploadResult,
  ): BaselineCreatedResultDto | IdenticalResultDto | ComparisonQueuedResultDto {
    if (result.status === ComparisonOutcome.IDENTICAL) {
      return plainToInstance(IdenticalResultDto, result, {
        excludeExtraneousValues: true,
      });
    }
    if (result.status === ComparisonOutcome.BASELINE_CREATED) {
      return plainToInstance(BaselineCreatedResultDto, result, {
        excludeExtraneousValues: true,
      });
    }
    if (result.status === ComparisonOutcome.COMPARISON_QUEUED) {
      return plainToInstance(ComparisonQueuedResultDto, result, {
        excludeExtraneousValues: true,
      });
    }
    return assertNever(result);
  }
}
