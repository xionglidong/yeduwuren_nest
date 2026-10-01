import { Module } from '@nestjs/common';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { PaperModule } from '../paper/paper.module';
import { PredictionController } from './prediction.controller';
import { PredictionService } from './prediction.service';

@Module({
  imports: [ConfigStoreModule, PaperModule],
  controllers: [PredictionController],
  providers: [PredictionService],
})
export class PredictionModule {}
