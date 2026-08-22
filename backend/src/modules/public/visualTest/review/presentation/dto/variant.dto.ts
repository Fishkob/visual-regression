import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_VARIANT_FIELD_LENGTH } from '@public/visualTest/core/domain/value-objects/variant.vo';

export class VariantDto {
  @ApiProperty({ example: '1920x1080', description: 'Viewport resolution' })
  @IsString()
  @Expose()
  viewport!: string;

  @ApiProperty({ example: 'chrome', description: 'Browser used' })
  @IsString()
  @Expose()
  browser!: string;

  @ApiProperty({
    example: 'staging',
    description: 'Environment or build context',
  })
  @IsString()
  @Expose()
  environment!: string;
}

export class VariantFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_FIELD_LENGTH)
  viewport?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_FIELD_LENGTH)
  browser?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_FIELD_LENGTH)
  environment?: string;
}
