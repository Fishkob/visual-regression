import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 256 })
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  newPassword!: string;
}
