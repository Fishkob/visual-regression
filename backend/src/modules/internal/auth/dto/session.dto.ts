import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

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
