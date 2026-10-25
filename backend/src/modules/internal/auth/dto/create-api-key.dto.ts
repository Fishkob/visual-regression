import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  API_KEY_SCOPES,
  type ApiKeyScope,
} from '@common/domain/api-key-scopes';

const MAX_EXPIRY_DAYS = 3650;

export class CreateApiKeyDto {
  @ApiProperty({ example: 'ci-upload' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_EXPIRY_DAYS,
    description: 'Lifetime in days; omit for a key that never expires',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EXPIRY_DAYS)
  expiresInDays?: number;

  @ApiPropertyOptional({
    enum: API_KEY_SCOPES,
    isArray: true,
    default: ['upload'],
    description:
      'Permissions of the key. Defaults to upload only; admin is opt-in.',
  })
  @IsOptional()
  @Type(() => String)
  @IsArray()
  @ArrayUnique()
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes?: ApiKeyScope[];

  @ApiPropertyOptional({
    type: [String],
    isArray: true,
    description:
      'Project names the key may access. Empty means every project; a non-empty list confines the key to those project routes.',
  })
  @IsOptional()
  @Type(() => String)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMaxSize(100)
  projectNames?: string[];
}

export class CreatedApiKeyDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ example: 'ci-upload' })
  name!: string;

  @Expose()
  @ApiProperty({ description: 'Shown exactly once; only the hash is stored' })
  rawKey!: string;

  @Expose()
  @ApiProperty({ enum: API_KEY_SCOPES, isArray: true })
  scopes!: ApiKeyScope[];

  @Expose()
  @ApiProperty({ type: [String], isArray: true })
  projectNames!: string[];

  @Expose()
  @ApiProperty({ example: '7f3a' })
  keyHint!: string;

  @Expose()
  @ApiProperty({ type: String, nullable: true })
  expiresAt!: Date | null;
}
