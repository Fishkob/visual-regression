import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireActor } from '@common/http/authenticated-principal';
import { Roles } from '@common/http/roles.decorator';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { RetentionPreviewService } from '@public/visualTest/access/application/retention-preview.service';
import { RetentionPreviewDto } from '@public/visualTest/access/presentation/dto/retention-preview.dto';
import { ProjectService } from '@public/visualTest/catalog/application/project.service';
import {
  StorageUsageDto,
  UpdateRetentionDto,
} from '@public/visualTest/access/presentation/dto/storage.dto';

@ApiTags('Storage')
@Controller('projects/:projectName/storage')
export class StorageController {
  constructor(
    private readonly storage: StorageUsageService,
    private readonly projects: ProjectService,
    private readonly preview: RetentionPreviewService,
  ) {}

  @Scope('read')
  @Get()
  @ApiOperation({
    summary: 'Current storage usage, quota and retention settings',
  })
  @ApiOkResponse({ type: StorageUsageDto })
  async get(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
  ): Promise<StorageUsageDto> {
    const usage = await this.storage.get(projectName);
    return plainToInstance(StorageUsageDto, usage, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('read')
  @Get('preview')
  @ApiOperation({
    summary: 'Dry-run: what retention would reclaim without deleting anything',
  })
  @ApiOkResponse({ type: RetentionPreviewDto })
  async previewRetention(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
  ): Promise<RetentionPreviewDto> {
    const preview = await this.preview.get(projectName);
    return plainToInstance(RetentionPreviewDto, preview, {
      excludeExtraneousValues: true,
    });
  }

  @Scope('admin')
  @Patch()
  // Retention decides which evidence survives, so it is a policy surface like
  // the review policy and the pixel threshold: ADMIN-owned and audited.
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Update per-project retention and quota settings',
  })
  @ApiForbiddenResponse({ description: 'Requires the ADMIN role' })
  @ApiOkResponse({ type: StorageUsageDto })
  async update(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: UpdateRetentionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StorageUsageDto> {
    await this.projects.updateRetention(
      projectName,
      {
        baselineRevisionLimit: dto.baselineRevisionLimit,
        runHistoryDays: dto.runHistoryDays,
        orphanGraceHours: dto.orphanGraceHours,
        storageQuotaBytes: dto.storageQuotaBytes,
        quotaSoftPercent: dto.quotaSoftPercent,
      },
      requireActor(req),
    );
    const usage = await this.storage.get(projectName);
    return plainToInstance(StorageUsageDto, usage, {
      excludeExtraneousValues: true,
    });
  }
}
