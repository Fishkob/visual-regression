import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

// One changed area of a comparison, in the comparison image's pixel space.
// Regions are ordered largest first; the review page numbers them in that order.
export class ChangedRegionDto {
  @ApiProperty({ description: 'Left edge in image pixels' })
  @IsInt()
  @Min(0)
  @Expose()
  x!: number;

  @ApiProperty({ description: 'Top edge in image pixels' })
  @IsInt()
  @Min(0)
  @Expose()
  y!: number;

  @ApiProperty({ description: 'Width in image pixels' })
  @IsInt()
  @Min(1)
  @Expose()
  width!: number;

  @ApiProperty({ description: 'Height in image pixels' })
  @IsInt()
  @Min(1)
  @Expose()
  height!: number;

  @ApiProperty({
    description: 'Mismatched pixels inside this region (not its area)',
  })
  @IsInt()
  @Min(1)
  @Expose()
  pixelCount!: number;
}
