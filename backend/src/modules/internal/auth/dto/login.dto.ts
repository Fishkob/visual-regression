import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

// Login is unauthenticated and reaches both a database lookup and the scrypt
// gate, so the credential length is bounded: 64 matches the user DTO, and the
// password ceiling keeps a multi-megabyte "password" out of the hashing queue.
export class LoginDto {
  @ApiProperty({ example: 'alice', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @ApiProperty({ example: 'secret', maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
