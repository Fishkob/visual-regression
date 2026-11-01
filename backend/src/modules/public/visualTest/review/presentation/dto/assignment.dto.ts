import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  testName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  runKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiProperty({ example: 'alice' })
  @IsString()
  @MaxLength(64)
  assignee!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class AssignmentDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  projectName!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  branchName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  testName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  testKind!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  runKey!: string | null;

  @ApiProperty()
  @Expose()
  assigneeUsername!: string;

  @ApiProperty()
  @Expose()
  assignedBy!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  dueAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  completedAt!: Date | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty()
  @Expose()
  isOverdue!: boolean;
}

export class AssignmentListQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeCompleted?: boolean;
}
