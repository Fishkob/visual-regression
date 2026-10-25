import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateShareLinkDto {
  @ApiProperty({ enum: ['PROJECT', 'TEST', 'RUN'] })
  @IsIn(['PROJECT', 'TEST', 'RUN'])
  scope!: 'PROJECT' | 'TEST' | 'RUN';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  testName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  runKey?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  @ApiPropertyOptional({ minLength: 4, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  passphrase?: string;
}

export class ShareLinkDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty({ enum: ['PROJECT', 'TEST', 'RUN'] })
  @Expose()
  scope!: string;

  @ApiProperty()
  @Expose()
  projectName!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  testName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  branchName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  runKey!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  createdBy!: string | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty()
  @Expose()
  expiresAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  revokedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  lastAccessedAt!: Date | null;

  @ApiProperty()
  @Expose()
  accessCount!: number;

  @ApiProperty()
  @Expose()
  hasPassphrase!: boolean;
}

export class CreatedShareLinkDto {
  @ApiProperty({ type: ShareLinkDto })
  @Expose()
  @Type(() => ShareLinkDto)
  link!: ShareLinkDto;

  @ApiProperty({ description: 'Opaque bearer token for /share/<token>' })
  @Expose()
  token!: string;
}

export class ResolveShareDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  passphrase?: string;
}

export class PublicShareDto {
  @ApiProperty({ enum: ['PROJECT', 'TEST', 'RUN'] })
  @Expose()
  scope!: string;

  @ApiProperty()
  @Expose()
  projectName!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  testName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  branchName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  runKey!: string | null;

  @ApiProperty()
  @Expose()
  expiresAt!: Date;

  @ApiProperty({ type: Object })
  @Expose()
  project!: { name: string };

  @ApiPropertyOptional({ type: Object })
  @Expose()
  test?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  run?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object, isArray: true })
  @Expose()
  tests?: Record<string, unknown>[];
}
