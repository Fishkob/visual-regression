import { Controller, Get, Query } from '@nestjs/common';
import { Scope } from '@common/http/api-key-scope.decorator';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { SearchService } from '@public/visualTest/catalog/application/search.service';
import {
  SearchQueryDto,
  SearchResultsDto,
} from '@public/visualTest/catalog/presentation/dto/search.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Scope('read')
  @Get()
  @ApiOperation({
    summary: 'Search projects, tests and branches (server-paginated groups)',
  })
  @ApiOkResponse({ type: SearchResultsDto })
  async query(@Query() query: SearchQueryDto): Promise<SearchResultsDto> {
    const results = await this.search.query(query.q, query.limit ?? 8);
    return plainToInstance(SearchResultsDto, results, {
      excludeExtraneousValues: true,
    });
  }
}
