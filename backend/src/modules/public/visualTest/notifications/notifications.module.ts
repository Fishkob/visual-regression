import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AuditModule } from '@internal/audit/audit.module';
import { WebhooksModule } from '@internal/webhooks/webhooks.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { CatalogModule } from '@public/visualTest/catalog/catalog.module';
import { WebhooksController } from '@public/visualTest/notifications/presentation/controllers/webhooks.controller';
import { WebhookSettingsService } from '@public/visualTest/notifications/application/webhook-settings.service';

// The project's outbound notification target. The delivery machinery lives in
// internal/webhooks (the worker dispatches); this module is its administration.
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    WebhooksModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
    CatalogModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhookSettingsService],
})
export class NotificationsModule {}
