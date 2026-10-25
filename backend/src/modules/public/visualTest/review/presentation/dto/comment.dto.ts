import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
