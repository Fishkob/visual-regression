import { Controller, Get, Query, Req } from '@nestjs/common';
import { Scope } from '@common/http/api-key-scope.decorator';
import { AuthenticatedRequest } from '@common/http/authenticated-request';
import { requireProjectScope } from '@common/http/authenticated-principal';
import { ProjectSpanning } from '@common/http/project-route.decorator';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { SearchService } from '@public/visualTest/catalog/application/search.service';
import {
  SearchQueryDto,
  SearchResultsDto,
} from '@public/visualTest/catalog/presentation/dto/search.dto';

@ApiTags('Search')
@ProjectSpanning()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Scope('read')
  @Get()
  @ApiOperation({
    summary: 'Search projects, tests and branches (server-paginated groups)',
  })
  @ApiOkResponse({ type: SearchResultsDto })
  async query(
    @Query() query: SearchQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SearchResultsDto> {
    const results = await this.search.query(
      query.q,
      requireProjectScope(req),
      query.limit ?? 8,
    );
    return plainToInstance(SearchResultsDto, results, {
      excludeExtraneousValues: true,
    });
  }
}
