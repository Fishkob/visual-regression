import { Module } from '@nestjs/common';
import { CoreInfrastructureModule } from '@/core-infrastructure.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { IntakeApplicationModule } from '@public/visualTest/intake/intake-application.module';
import { ReviewModule } from '@public/visualTest/review/review.module';
import { HealthModule } from '@internal/health/health.module';
import { AuthModule } from '@internal/auth/auth.module';
import { AdminApiKeysModule } from '@internal/admin/admin-api-keys.module';
import { ApiKeysModule } from '@internal/api-keys/api-keys.module';
import { UsersModule } from '@internal/users/users.module';
@Module({
  imports: [
    CoreInfrastructureModule,
    VisualTestApplicationModule,
    IntakeApplicationModule,
    ReviewModule,
    HealthModule,
    AuthModule,
    AdminApiKeysModule,
    ApiKeysModule,
    UsersModule,
  ],
})
export class SwaggerAppModule {}
