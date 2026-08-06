import { Module } from '@nestjs/common';
import { TimerController } from './timer.controller';
import { TimerService } from './timer.service';
import { TimerRepository } from './timer.repository';

@Module({
  controllers: [TimerController],
  providers: [TimerService, TimerRepository],
  exports: [TimerService, TimerRepository],
})
export class TimerModule {}
