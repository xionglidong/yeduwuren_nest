import { Module } from '@nestjs/common';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { PredictionController } from './prediction.controller';
import { PredictionService } from './prediction.service';

@Module({
  imports: [ConfigStoreModule],
  controllers: [PredictionController],
  providers: [PredictionService],
  exports: [PredictionService],
})
export class PredictionModule {}
