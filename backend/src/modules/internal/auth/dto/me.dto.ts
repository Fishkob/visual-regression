import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MeDto {
  @Expose()
  @ApiProperty({ example: 'alice' })
  username!: string;
}
