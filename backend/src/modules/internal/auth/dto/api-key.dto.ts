import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_EXPIRY_DAYS = 3650;
// The grace window is bounded to a day: it exists to let a pipeline pick up the
// rotated key, not to keep the retired credential alive indefinitely.
const MAX_GRACE_MINUTES = 1440;

export class ApiKeyDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ example: 'ci-upload' })
  name!: string;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    example: '7f3a',
    description: 'Last characters of the raw key, for recognition only',
  })
  keyHint!: string | null;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'User that created the key',
  })
  createdBy!: string | null;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Last authenticated request, updated at most hourly',
  })
  lastUsedAt!: Date | null;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null means the key never expires',
  })
  expiresAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, nullable: true })
  revokedAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, nullable: true, example: 'rotated' })
  revokedReason!: string | null;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Id of the key that replaced this one during a rotation',
  })
  replacedById!: string | null;

  @Expose()
  @ApiProperty({ enum: ['active', 'revoked', 'expired'] })
  status!: 'active' | 'revoked' | 'expired';
}

export class RevokeApiKeyDto {
  @ApiPropertyOptional({
    example: 'pipeline migrated to new key',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class RotateApiKeyDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_GRACE_MINUTES,
    default: 0,
    description:
      'Minutes the previous key keeps working, so a pipeline can be updated',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_GRACE_MINUTES)
  graceMinutes?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: MAX_EXPIRY_DAYS,
    description:
      'Lifetime of the new key in days. Omit to inherit the remaining lifetime of the key being replaced; send null for a key that never expires.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EXPIRY_DAYS)
  expiresInDays?: number | null;
}
