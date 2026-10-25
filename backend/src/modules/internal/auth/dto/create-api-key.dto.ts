import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

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
  @ApiProperty({ example: '7f3a' })
  keyHint!: string;

  @Expose()
  @ApiProperty({ type: String, nullable: true })
  expiresAt!: Date | null;
}
