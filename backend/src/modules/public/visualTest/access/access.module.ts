import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
import { AuditModule } from '@internal/audit/audit.module';
import { AuthModule } from '@internal/auth/auth.module';
import { StorageModule } from '@internal/storage/storage.module';
import { PdfSidecarModule } from '@internal/pdf-sidecar/pdf-sidecar.module';
import { VisualTestInfraModule } from '@public/visualTest/core/visual-test-infra.module';
import { VisualTestApplicationModule } from '@public/visualTest/core/visual-test-application.module';
import { ReviewModule } from '@public/visualTest/review/review.module';
import { CatalogModule } from '@public/visualTest/catalog/catalog.module';
import {
  PublicShareController,
  ShareLinkRevokeController,
  ShareLinksController,
} from '@public/visualTest/access/presentation/controllers/share-link.controller';
import { PdfController } from '@public/visualTest/access/presentation/controllers/pdf.controller';
import { StorageController } from '@public/visualTest/access/presentation/controllers/storage.controller';
import { PdfAccessService } from '@public/visualTest/access/application/pdf-access.service';
import { RetentionPreviewService } from '@public/visualTest/access/application/retention-preview.service';
import { ShareLinkService } from '@public/visualTest/access/application/share-link.service';
import { ShareLinkRepository } from '@public/visualTest/access/infrastructure/repositories/share-link.repository';

// How evidence is reached from outside a review session: expiring read-only
// share links, the PDF render/download proxies, and the storage/retention
// settings that bound what is kept.
@Module({
  imports: [
    PrismaModule,
    AppConfigModule,
    StorageModule,
    AuditModule,
    AuthModule,
    PdfSidecarModule,
    VisualTestInfraModule,
    VisualTestApplicationModule,
    ReviewModule,
    CatalogModule,
  ],
  controllers: [
    PdfController,
    StorageController,
    ShareLinksController,
    ShareLinkRevokeController,
    PublicShareController,
  ],
  providers: [
    PdfAccessService,
    RetentionPreviewService,
    ShareLinkService,
    ShareLinkRepository,
  ],
})
export class AccessModule {}
