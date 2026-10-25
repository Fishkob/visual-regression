import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MeDto {
  @Expose()
  @ApiProperty({ example: 'alice' })
  username!: string;

  @Expose()
  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'], example: 'MEMBER' })
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';

  @Expose()
  @ApiProperty({ example: false })
  mustChangePassword!: boolean;
}
