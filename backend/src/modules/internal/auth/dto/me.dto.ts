import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { TeamRefDto } from '@internal/teams/dto/team.dto';

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

  @Expose()
  @ApiProperty({
    example: false,
    description:
      'True when the caller is not project-scoped at all (an ADMIN, or a key without an owner or allowlist). The UI reads it to say "all projects" instead of naming teams.',
  })
  seesAllProjects!: boolean;

  @Expose()
  @Type(() => TeamRefDto)
  @ApiProperty({
    type: () => TeamRefDto,
    isArray: true,
    description:
      'The teams the caller belongs to. An API key is a credential, not a person, so it holds none.',
  })
  teams!: TeamRefDto[];
}
