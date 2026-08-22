import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  private skipInput?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  private takeInput?: number;

  @ApiPropertyOptional({
    description: 'Record offset (0-based), alternative to page',
    minimum: 0,
    type: Number,
  })
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  get skip(): number {
    return this.skipInput ?? ((this.page ?? 1) - 1) * this.take;
  }

  set skip(value: unknown) {
    if (value === undefined || value === null) return;
    this.skipInput = typeof value === 'number' ? value : Number(value);
  }

  @ApiPropertyOptional({
    description: 'Page size, alternative to limit',
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  get take(): number {
    return this.takeInput ?? this.limit ?? 20;
  }

  set take(value: unknown) {
    if (value === undefined || value === null) return;
    this.takeInput = typeof value === 'number' ? value : Number(value);
  }

  // True when the client paginated by offset (skip/take) rather than by page.
  // Exposed so paginated-query can report the truthful page in the meta.
  get skipProvided(): boolean {
    return this.skipInput !== undefined;
  }
}
