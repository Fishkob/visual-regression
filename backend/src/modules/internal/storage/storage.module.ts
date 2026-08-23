import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { STORAGE_PROVIDER } from '@common/domain/storage-provider.interface';
import { RustFsStorageService } from './services/rustfs-storage.service';
import { StorageObjectName } from './services/storage-object-name';
@Module({
  imports: [AppConfigModule],
  providers: [
    RustFsStorageService,
    StorageObjectName,
    { provide: STORAGE_PROVIDER, useExisting: RustFsStorageService },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
