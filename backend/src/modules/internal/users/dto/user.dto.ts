import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'alice' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'] })
  @IsIn(['ADMIN', 'MEMBER', 'VIEWER'])
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ['ADMIN', 'MEMBER', 'VIEWER'] })
  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER', 'VIEWER'])
  role?: 'ADMIN' | 'MEMBER' | 'VIEWER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UserDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  username!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'] })
  @Expose()
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';

  @ApiProperty()
  @Expose()
  isActive!: boolean;

  @ApiProperty()
  @Expose()
  mustChangePassword!: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  deactivatedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  createdBy?: string | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;
}

export class UserInviteLinkDto {
  @ApiProperty({
    description:
      'Secret carried by the one-time link (GET /public/user-invites/:token). ' +
      'It is never stored; the row keeps its hash only.',
  })
  @Expose()
  token!: string;

  @ApiProperty()
  @Expose()
  expiresAt!: Date;
}

export class CreatedUserDto {
  @ApiProperty({ type: UserDto })
  @Expose()
  @Type(() => UserDto)
  user!: UserDto;

  @ApiProperty({ type: UserInviteLinkDto })
  @Expose()
  @Type(() => UserInviteLinkDto)
  invite!: UserInviteLinkDto;
}

export class ResetPasswordResultDto {
  @ApiProperty({ type: UserInviteLinkDto })
  @Expose()
  @Type(() => UserInviteLinkDto)
  invite!: UserInviteLinkDto;
}

export class InvitePreviewDto {
  @ApiProperty()
  @Expose()
  username!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'] })
  @Expose()
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';

  @ApiProperty()
  @Expose()
  expiresAt!: Date;

  @ApiProperty({ enum: ['pending', 'used', 'expired'] })
  @Expose()
  status!: 'pending' | 'used' | 'expired';
}

export class InviteRevealDto {
  @ApiProperty()
  @Expose()
  username!: string;

  @ApiProperty({
    description:
      'The temporary password this link carried. It is derived from the token, ' +
      'so it exists only in this response and in the account hash.',
  })
  @Expose()
  temporaryPassword!: string;
}
