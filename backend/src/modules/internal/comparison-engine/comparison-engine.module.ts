import { Module } from '@nestjs/common';
import { PixelmatchComparisonService } from './services/pixelmatch-comparison.service';
import {
  COMPARISON_ENGINES,
  PDF_COMPARISON_ENGINE,
  IComparisonEngine,
} from '@common/domain/comparison-engine.interface';
import { PdfSidecarModule } from '@internal/pdf-sidecar/pdf-sidecar.module';

@Module({
  imports: [PdfSidecarModule],
  providers: [
    PixelmatchComparisonService,
    {
      provide: COMPARISON_ENGINES,
      useFactory: (
        image: PixelmatchComparisonService,
        pdf: IComparisonEngine,
      ) => ({ image, pdf }),
      inject: [PixelmatchComparisonService, PDF_COMPARISON_ENGINE],
    },
  ],
  exports: [COMPARISON_ENGINES],
})
export class ComparisonEngineModule {}
