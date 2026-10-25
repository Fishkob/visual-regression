import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaginationMetaDto {
  @ApiProperty()
  @Expose()
  page!: number;

  @ApiProperty()
  @Expose()
  limit!: number;

  @ApiProperty()
  @Expose()
  total!: number;

  @ApiProperty()
  @Expose()
  totalPages!: number;

  @ApiProperty()
  @Expose()
  hasNextPage!: boolean;

  @ApiProperty()
  @Expose()
  hasPreviousPage!: boolean;
}

export function PaginatedResponseDto<T>(itemType: new () => T) {
  const className = `Paginated${itemType.name}`;
  class PaginatedResponseDtoInner {
    @ApiProperty({ type: itemType, isArray: true })
    data!: T[];

    @ApiProperty({ type: PaginationMetaDto })
    meta!: PaginationMetaDto;
  }
  Object.defineProperty(PaginatedResponseDtoInner, 'name', {
    value: className,
  });
  return PaginatedResponseDtoInner;
}

export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
) {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
