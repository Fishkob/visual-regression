import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'alice' })
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({ example: 'secret' })
  @IsString()
  @MinLength(1)
  password!: string;
}
