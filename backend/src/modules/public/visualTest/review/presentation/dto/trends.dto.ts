import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class TrendsQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class DailyOutcomeDto {
  @ApiProperty({ example: '2026-01-01' })
  @Expose()
  date!: string;

  @ApiProperty()
  @Expose()
  changed!: number;

  @ApiProperty()
  @Expose()
  unchanged!: number;

  @ApiProperty()
  @Expose()
  withinThreshold!: number;
}

export class PendingReviewTrendDto {
  @ApiProperty()
  @Expose()
  count!: number;

  @ApiProperty()
  @Expose()
  avgSeconds!: number;

  @ApiProperty()
  @Expose()
  maxSeconds!: number;
}

export class ApprovalLatencyDto {
  @ApiProperty()
  @Expose()
  count!: number;

  @ApiProperty()
  @Expose()
  avgSeconds!: number;
}

export class FlakeRateDto {
  @ApiProperty()
  @Expose()
  flakyTests!: number;

  @ApiProperty()
  @Expose()
  totalTests!: number;

  @ApiProperty()
  @Expose()
  rate!: number;
}

export class TrendsDto {
  @ApiProperty()
  @Expose()
  from!: string;

  @ApiProperty()
  @Expose()
  to!: string;

  @ApiProperty()
  @Expose()
  days!: number;

  @ApiProperty({ type: DailyOutcomeDto, isArray: true })
  @Expose()
  @Type(() => DailyOutcomeDto)
  daily!: DailyOutcomeDto[];

  @ApiProperty({ type: PendingReviewTrendDto })
  @Expose()
  @Type(() => PendingReviewTrendDto)
  pendingReview!: PendingReviewTrendDto;

  @ApiProperty({ type: ApprovalLatencyDto })
  @Expose()
  @Type(() => ApprovalLatencyDto)
  approvalLatency!: ApprovalLatencyDto;

  @ApiProperty({ type: FlakeRateDto })
  @Expose()
  @Type(() => FlakeRateDto)
  flakeRate!: FlakeRateDto;
}
