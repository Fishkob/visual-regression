import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsDate, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';

export class AuditFilterDto {
  @ApiPropertyOptional({ description: 'Filter by actor username' })
  @IsOptional()
  @IsString()
  actor?: string;

  @ApiPropertyOptional({ enum: Object.values(AUDIT_ACTIONS) })
  @IsOptional()
  @IsIn(Object.values(AUDIT_ACTIONS))
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by project name' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ description: 'Inclusive ISO start date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Inclusive ISO end date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class AuditQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actor?: string;

  @ApiPropertyOptional({ enum: Object.values(AUDIT_ACTIONS) })
  @IsOptional()
  @IsIn(Object.values(AUDIT_ACTIONS))
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class AuditExportQueryDto extends AuditFilterDto {}

export class AuditEventDto {
  @ApiProperty()
  @IsString()
  @Expose()
  id!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Expose()
  actor?: string | null;

  @ApiProperty()
  @IsString()
  @Expose()
  action!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Expose()
  projectName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Expose()
  testName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Expose()
  branchName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Expose()
  targetType?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Expose()
  targetId?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  @Expose()
  metadata?: Record<string, unknown> | null;

  @ApiProperty()
  @IsDate()
  @Type(() => Date)
  @Expose()
  createdAt!: Date;
}
