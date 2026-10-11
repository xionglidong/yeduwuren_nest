import { Module } from '@nestjs/common';
import { TeachingLogController } from './teaching-log.controller';
import { TeachingLogService } from './teaching-log.service';
import { TeachingLogRepository } from './teaching-log.repository';

@Module({
  controllers: [TeachingLogController],
  providers: [TeachingLogService, TeachingLogRepository],
  exports: [TeachingLogService, TeachingLogRepository],
})
export class TeachingLogModule {}
