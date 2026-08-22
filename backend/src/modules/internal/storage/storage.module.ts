import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { STORAGE_PROVIDER } from '@common/domain/storage-provider.interface';
import { MinioStorageService } from './services/minio-storage.service';
import { StorageObjectName } from './services/storage-object-name';
@Module({
  imports: [AppConfigModule],
  providers: [
    MinioStorageService,
    StorageObjectName,
    { provide: STORAGE_PROVIDER, useExisting: MinioStorageService },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
