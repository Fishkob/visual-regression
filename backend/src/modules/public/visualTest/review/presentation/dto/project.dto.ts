import { Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsDate,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsNotIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TestStatus } from '@public/visualTest/core/domain/types/visual-test.types';
import { VisualTestDto } from '@public/visualTest/review/presentation/dto/visual-test.dto';
import { VariantFilterDto } from '@public/visualTest/review/presentation/dto/variant.dto';
import { PaginationDto } from '@common/dto/pagination.dto';
import {
  NAME_REGEXP,
  MAX_NAME_LENGTH,
  PROJECT_RESERVED_NAMES,
} from '@common/http/pipes/name-validation.util';
import { MAX_BRANCH_NAME_LENGTH } from '@public/visualTest/core/domain/constants/branch.constants';

export class ProjectDto {
  @ApiPropertyOptional({ example: 'project_123' })
  @IsOptional()
  @IsString()
  @Expose()
  id?: string;

  @ApiPropertyOptional({ example: 'checkout-flow' })
  @IsOptional()
  @IsString()
  @Expose()
  name?: string;

  @ApiPropertyOptional({ example: '2025-10-11T10:15:00Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @Expose()
  createdAt?: Date;

  @ApiPropertyOptional({ type: () => VisualTestDto, isArray: true })
  @IsOptional()
  @Expose()
  @Type(() => VisualTestDto)
  visualTests?: VisualTestDto[];

  @ApiPropertyOptional({ example: 'group_123', nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  groupId?: string | null;

  @ApiPropertyOptional({ example: 'Checkout', nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  groupName?: string | null;

  @ApiPropertyOptional({ example: 'feature/x' })
  @IsOptional()
  @IsString()
  @Expose()
  branchName?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  @Expose()
  defaultBranchName?: string;

  @ApiPropertyOptional({ example: 3, type: Number })
  @IsOptional()
  @IsInt()
  @Expose()
  pendingCount?: number;

  @ApiPropertyOptional({ example: 12, type: Number })
  @IsOptional()
  @IsInt()
  @Expose()
  testCount?: number;

  @ApiPropertyOptional({
    description: 'Whether the project has pending comparisons',
  })
  @IsOptional()
  @Expose()
  pending?: boolean;
}

export class ProjectTestDto {
  @ApiProperty()
  @IsDefined()
  @IsString()
  @Expose()
  name!: string;

  @ApiProperty()
  @IsDefined()
  @IsString()
  @Expose()
  kind!: string;

  @ApiPropertyOptional({
    enum: TestStatus,
    enumName: 'TestStatus',
    description: 'Latest status of the test',
  })
  @IsOptional()
  @Allow()
  @Expose()
  status?: TestStatus | null;

  @ApiPropertyOptional({ enum: ['branch', 'inherited'] })
  @IsOptional()
  @IsString()
  @Expose()
  origin?: 'branch' | 'inherited';

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Expose()
  inheritedFrom?: string | null;
}

export class CreateProjectDto {
  @ApiProperty({ example: 'checkout-ui' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NAME_LENGTH)
  @Matches(NAME_REGEXP, {
    message: 'Project name must be alphanumeric, dash or underscore',
  })
  @IsNotIn([...PROJECT_RESERVED_NAMES], {
    message: 'This project name is reserved and cannot be used',
  })
  name!: string;

  @ApiPropertyOptional({ example: 'group_123', type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  groupId?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({
    description: 'Group id, or null to move the project to Unassigned',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  groupId?: string | null;

  @ApiPropertyOptional({
    description: 'Branch to promote to the project default',
    example: 'release/1.2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BRANCH_NAME_LENGTH)
  defaultBranchName?: string;
}

export class UpdateThresholdDto {
  @ApiProperty({
    description: 'Allowed pixel difference threshold',
    example: 25,
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(100000)
  @Expose()
  threshold!: number;
}

// The whole query object is validated as one DTO so whitelist/forbidNonWhitelisted
// can reject genuinely unknown params without rejecting the endpoint's own
// extra params (kind) as if they were stray.
export class TestNamesQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by test kind (image or pdf)',
  })
  @IsOptional()
  @IsString()
  kind?: string;

  // Declared for the whitelist only; BranchNameValidationPipe owns the rule
  // (so a repeated/malformed branch is a 400 on every route).
  @ApiPropertyOptional({
    description: 'Branch to read (defaults to the project default branch)',
  })
  @IsOptional()
  @Allow()
  branch?: string;
}

export class UpdateThresholdQueryDto extends VariantFilterDto {
  @ApiPropertyOptional({
    description:
      'When true, returns how many pending comparisons the value would auto-accept without mutating anything',
  })
  @IsOptional()
  @IsString()
  preview?: string;
}
