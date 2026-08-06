import { Module } from '@nestjs/common';
import { SelfLearningController } from './controllers/self-learning.controller';
import { SelfLearningService } from './services/self-learning.service';
import { SelfLearningRepository } from './repositories/self-learning.repository';
import { ConfigStoreModule } from '../config-store/config-store.module';

@Module({
  imports: [ConfigStoreModule],
  controllers: [SelfLearningController],
  providers: [SelfLearningService, SelfLearningRepository],
  exports: [SelfLearningService, SelfLearningRepository],
})
export class SelfLearningModule {}
