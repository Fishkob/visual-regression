import { Module } from '@nestjs/common';
import { CoreInfrastructureModule } from '@/core-infrastructure.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { IntakeApplicationModule } from '@public/visualTest/intake/intake-application.module';
import { ReviewModule } from '@public/visualTest/review/review.module';
import { HealthModule } from '@internal/health/health.module';
@Module({
  imports: [
    CoreInfrastructureModule,
    VisualTestApplicationModule,
    IntakeApplicationModule,
    ReviewModule,
    HealthModule,
  ],
})
export class SwaggerAppModule {}
