import { Module } from '@nestjs/common';
import { ConfigStoreController } from './config-store.controller';
import { ConfigStoreService } from './config-store.service';

@Module({
  controllers: [ConfigStoreController],
  providers: [ConfigStoreService],
  exports: [ConfigStoreService],
})
export class ConfigStoreModule {}
