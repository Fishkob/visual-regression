import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { ProjectNameValidationPipe } from '@common/http/pipes/project-name-validation.pipe';
import { Scope } from '@common/http/api-key-scope.decorator';
import { TrendsService } from '@public/visualTest/review/application/trends.service';
import {
  TrendsDto,
  TrendsQueryDto,
} from '@public/visualTest/review/presentation/dto/trends.dto';

@ApiTags('Reports')
@Controller('projects/:projectName/trends')
export class TrendsController {
  constructor(private readonly trends: TrendsService) {}

  @Scope('read')
  @Get()
  @ApiOperation({
    summary:
      'Read comparison volume, review age, approval latency and flake rate',
  })
  @ApiOkResponse({ type: TrendsDto })
  async get(
    @Param('projectName', ProjectNameValidationPipe) projectName: string,
    @Query() query: TrendsQueryDto,
  ): Promise<TrendsDto> {
    const trends = await this.trends.get(projectName, query.days ?? 30);
    return plainToInstance(TrendsDto, trends, {
      excludeExtraneousValues: true,
    });
  }
}
