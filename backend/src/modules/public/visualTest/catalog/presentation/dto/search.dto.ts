import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class SearchProjectDto {
  @ApiProperty()
  @Expose()
  name!: string;
}

export class SearchTestDto {
  @ApiProperty()
  @Expose()
  projectName!: string;

  @ApiProperty()
  @Expose()
  branchName!: string;

  @ApiProperty()
  @Expose()
  testName!: string;

  @ApiProperty({ enum: ['image', 'pdf'] })
  @Expose()
  kind!: string;

  @ApiProperty()
  @Expose()
  status!: string;
}

export class SearchBranchDto {
  @ApiProperty()
  @Expose()
  projectName!: string;

  @ApiProperty()
  @Expose()
  branchName!: string;

  @ApiProperty()
  @Expose()
  isDefault!: boolean;
}

export class SearchResultsDto {
  @ApiProperty()
  @Expose()
  query!: string;

  @ApiProperty({ type: SearchProjectDto, isArray: true })
  @Expose()
  @Type(() => SearchProjectDto)
  projects!: SearchProjectDto[];

  @ApiProperty({ type: SearchTestDto, isArray: true })
  @Expose()
  @Type(() => SearchTestDto)
  tests!: SearchTestDto[];

  @ApiProperty({ type: SearchBranchDto, isArray: true })
  @Expose()
  @Type(() => SearchBranchDto)
  branches!: SearchBranchDto[];
}
