import { Module } from '@nestjs/common';
import { UploadController, LegacyUploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { STORAGE_SERVICE_TOKEN } from './interfaces/storage.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Module({
  controllers: [UploadController, LegacyUploadController],
  providers: [
    UploadService,
    {
      provide: STORAGE_SERVICE_TOKEN,
      useClass: LocalStorageProvider,
    },
  ],
  exports: [UploadService, STORAGE_SERVICE_TOKEN],
})
export class UploadModule {}
