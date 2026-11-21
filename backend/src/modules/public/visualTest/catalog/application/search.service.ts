import { Injectable } from '@nestjs/common';
import type { ProjectScope } from '@common/domain/project-scope';
import {
  SearchRepository,
  type SearchResults,
} from '@public/visualTest/catalog/infrastructure/repositories/search.repository';

@Injectable()
export class SearchService {
  constructor(private readonly search: SearchRepository) {}

  async query(
    rawQuery: string,
    scope: ProjectScope,
    limit = 8,
  ): Promise<SearchResults & { query: string }> {
    const query = rawQuery.trim();
    if (query.length === 0) {
      return { query, projects: [], tests: [], branches: [] };
    }
    const results = await this.search.search(
      query,
      Math.min(Math.max(limit, 1), 20),
      scope,
    );
    return { query, ...results };
  }
}
