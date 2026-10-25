import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
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

export class CreatedUserDto {
  @ApiProperty({ type: UserDto })
  @Expose()
  user!: UserDto;

  @ApiProperty({
    description: 'One-time temporary password; it is not stored in plain text.',
  })
  @Expose()
  temporaryPassword!: string;
}

export class ResetPasswordResultDto {
  @ApiProperty({
    description: 'One-time temporary password; it is not stored in plain text.',
  })
  @Expose()
  temporaryPassword!: string;
}
