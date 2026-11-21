import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// Mirrors the project-name rule (letters, digits, space, dash, underscore): a
// team name is a label a human reads in the admin list, and the same charset
// keeps both vocabularies from drifting.
const TEAM_NAME_REGEXP = /^[\p{L}\p{N} _-]+$/u;
const TEAM_NAME_MAX_LENGTH = 80;

export class CreateTeamDto {
  @ApiProperty({ example: 'Checkout' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEAM_NAME_MAX_LENGTH)
  @Matches(TEAM_NAME_REGEXP, {
    message:
      'Team name may contain letters, numbers, spaces, dashes and underscores',
  })
  name!: string;
}

export class UpdateTeamDto {
  @ApiProperty({ example: 'Storefront' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEAM_NAME_MAX_LENGTH)
  @Matches(TEAM_NAME_REGEXP, {
    message:
      'Team name may contain letters, numbers, spaces, dashes and underscores',
  })
  name!: string;
}

export class ReplaceTeamMembersDto {
  @ApiProperty({
    type: String,
    isArray: true,
    description:
      'The complete member set, replacing the current one. An empty list removes every member.',
    example: ['usr_1', 'usr_2'],
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  userIds!: string[];
}

export class AssignProjectTeamDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The team that owns the project, or null to make it shared (every authenticated principal keeps seeing it).',
    example: 'team_1',
  })
  // A missing property is rejected, an explicit null is accepted: unassigning is
  // a real write and must be spelled out, not inferred from an empty body.
  @ValidateIf((dto: AssignProjectTeamDto) => dto.teamId !== null)
  @IsString()
  @IsNotEmpty()
  teamId!: string | null;
}

export class TeamMemberDto {
  @ApiProperty()
  @Expose()
  userId!: string;

  @ApiProperty({ example: 'alice' })
  @Expose()
  username!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER'] })
  @Expose()
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export class TeamProjectDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty({ example: 'checkout-ui' })
  @Expose()
  name!: string;
}

export class TeamDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty({ example: 'Checkout' })
  @Expose()
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Who created the team',
  })
  @Expose()
  createdBy?: string | null;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty({ type: () => TeamMemberDto, isArray: true })
  @Expose()
  @Type(() => TeamMemberDto)
  members!: TeamMemberDto[];

  @ApiProperty({
    type: () => TeamProjectDto,
    isArray: true,
    description: 'The projects this team owns',
  })
  @Expose()
  @Type(() => TeamProjectDto)
  projects!: TeamProjectDto[];
}

export class ProjectTeamDto {
  @ApiProperty()
  @Expose()
  projectId!: string;

  @ApiProperty({ example: 'checkout-ui' })
  @Expose()
  projectName!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Null means the project is shared',
  })
  @Expose()
  teamId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Expose()
  teamName?: string | null;
}

export class TeamRefDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty({ example: 'Checkout' })
  @Expose()
  name!: string;
}
