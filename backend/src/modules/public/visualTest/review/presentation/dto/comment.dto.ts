import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { COMMENT_PAGE_SIZE } from '@public/visualTest/review/application/review-comment.service';

// The thread is read newest-first and paged by cursor: `before` is the id of
// the oldest comment the caller already holds, and the response keeps its
// oldest→newest order. Both filters and the cursor are declared here because
// the whole query object is validated with whitelist + forbidNonWhitelisted, so
// an unknown parameter is refused (422, the pipe's promotion) instead of being
// silently ignored.
export class ListCommentsQueryDto {
  @ApiPropertyOptional({
    description: 'Only comments anchored to this comparison',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  comparisonId?: string;

  @ApiPropertyOptional({
    description: 'Branch to read (defaults to the project default branch)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiPropertyOptional({
    description:
      'Cursor: the id of the oldest comment already received; returns older comments',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  before?: string;

  @ApiPropertyOptional({
    description: 'Page size',
    default: COMMENT_PAGE_SIZE,
    minimum: 1,
    maximum: COMMENT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COMMENT_PAGE_SIZE)
  limit?: number;
}

export class CreateCommentDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  comparisonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;
}

// Resolving is a write on the branch that owns the test, so it takes the same
// branch scope the read and the create take. Declared as a DTO rather than a
// bare @Query so the parameter reaches the OpenAPI contract (and therefore the
// generated SDK) instead of being a query the client cannot send.
export class ResolveCommentQueryDto {
  @ApiPropertyOptional({
    description:
      'Branch the thread belongs to (defaults to the project default)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;
}

export class CommentDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  projectName!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  branchName!: string | null;

  @ApiProperty()
  @Expose()
  testId!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  comparisonId!: string | null;

  @ApiProperty()
  @Expose()
  body!: string;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  authorId!: string | null;

  @ApiProperty()
  @Expose()
  author!: string;

  @ApiProperty()
  @Expose()
  createdAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  resolvedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  resolvedBy!: string | null;
}
