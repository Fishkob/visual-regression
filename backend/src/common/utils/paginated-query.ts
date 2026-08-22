import { createPaginatedResponse } from '@common/dto/paginated-response.dto';
export async function paginatedQuery<T, R = T>(
  query: (args: {
    skip: number;
    take: number;
  }) => Promise<{ data: T[]; total: number }>,
  pagination: {
    page?: number;
    limit?: number;
    skip: number;
    take: number;
    skipProvided?: boolean;
  },
  mapper?: (item: T) => R,
) {
  const { data, total } = await query({
    skip: pagination.skip,
    take: pagination.take,
  });
  // When the caller paginated by offset (skip/take), derive the page from the
  // offset so the meta stays truthful (`?skip=50&take=25` is page 3, not page 1
  // with hasPreviousPage: false).
  const page =
    pagination.skipProvided === true
      ? Math.floor(pagination.skip / pagination.take) + 1
      : (pagination.page ?? 1);
  return createPaginatedResponse(
    mapper ? data.map(mapper) : (data as unknown as R[]),
    page,
    pagination.take,
    total,
  );
}
