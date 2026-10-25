import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { ProjectService } from '@public/visualTest/review/application/project.service';
import {
  StorageUsageDto,
  UpdateRetentionDto,
} from '@public/visualTest/review/presentation/dto/storage.dto';

@ApiTags('Storage')
@Controller('projects/:projectName/storage')
export class StorageController {
  constructor(
    private readonly storage: StorageUsageService,
    private readonly projects: ProjectService,
  ) {}

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

  @Patch()
  @ApiOperation({
    summary: 'Update per-project retention and quota settings',
  })
  @ApiOkResponse({ type: StorageUsageDto })
  async update(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Body() dto: UpdateRetentionDto,
  ): Promise<StorageUsageDto> {
    await this.projects.updateRetention(projectName, {
      baselineRevisionLimit: dto.baselineRevisionLimit,
      runHistoryDays: dto.runHistoryDays,
      orphanGraceHours: dto.orphanGraceHours,
      storageQuotaBytes:
        dto.storageQuotaBytes === undefined
          ? undefined
          : dto.storageQuotaBytes === null
            ? null
            : BigInt(dto.storageQuotaBytes),
      quotaSoftPercent: dto.quotaSoftPercent,
    });
    const usage = await this.storage.get(projectName);
    return plainToInstance(StorageUsageDto, usage, {
      excludeExtraneousValues: true,
    });
  }
}
