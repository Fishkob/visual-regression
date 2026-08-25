import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'ci-upload' })
  @IsString()
  @MinLength(1)
  name!: string;
}

export class CreatedApiKeyDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Shown exactly once; only the hash is stored' })
  rawKey!: string;
}
