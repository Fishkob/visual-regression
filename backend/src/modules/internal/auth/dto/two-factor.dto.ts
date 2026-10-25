import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  challengeToken!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class EnableTotpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;
}

export class DisableTotpDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class TwoFactorChallengeDto {
  @ApiProperty({ example: true })
  @Expose()
  twoFactorRequired!: true;

  @ApiProperty()
  @Expose()
  challengeToken!: string;
}

export class TwoFactorSetupDto {
  @ApiProperty()
  @Expose()
  secret!: string;

  @ApiProperty()
  @Expose()
  otpauthUrl!: string;
}

export class RecoveryCodesDto {
  @ApiProperty({ type: [String], isArray: true })
  @Expose()
  recoveryCodes!: string[];
}

export class SessionDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  @Expose()
  lastSeenAt!: Date | null;

  @ApiProperty()
  @Expose()
  expiresAt!: Date;

  @ApiProperty({ nullable: true })
  @Expose()
  ip!: string | null;

  @ApiProperty({ nullable: true })
  @Expose()
  userAgent!: string | null;

  @ApiProperty()
  @Expose()
  isCurrent!: boolean;
}
