import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNotIn,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const GROUP_NAME_REGEXP = /^[\p{L}\p{N} _-]+$/u;
const GROUP_NAME_MAX_LENGTH = 80;

export class ProjectGroupDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty()
  @Expose()
  projectCount!: number;
}

export class CreateProjectGroupDto {
  @ApiProperty({ example: 'Checkout' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  @Matches(GROUP_NAME_REGEXP, {
    message:
      'Group name may contain letters, numbers, spaces, dashes and underscores',
  })
  @IsNotIn(['Unassigned'], {
    message: 'This group name is reserved and cannot be used',
  })
  name!: string;
}

export class UpdateProjectGroupDto {
  @ApiProperty({ example: 'Storefront' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  @Matches(GROUP_NAME_REGEXP, {
    message:
      'Group name may contain letters, numbers, spaces, dashes and underscores',
  })
  @IsNotIn(['Unassigned'], {
    message: 'This group name is reserved and cannot be used',
  })
  name!: string;
}
