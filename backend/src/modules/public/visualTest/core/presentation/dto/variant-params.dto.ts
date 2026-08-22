import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_VARIANT_FIELD_LENGTH } from '@public/visualTest/core/domain/value-objects/variant.vo';

export class VariantParamsDto {
  @ApiProperty({ example: '1920x1080', description: 'Viewport resolution' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_FIELD_LENGTH)
  viewport!: string;

  @ApiProperty({ example: 'Chrome', description: 'Browser used' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_FIELD_LENGTH)
  browser!: string;

  @ApiProperty({
    example: 'staging',
    description: 'Environment (dev, staging)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VARIANT_FIELD_LENGTH)
  environment!: string;
}
