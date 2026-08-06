import { Module } from '@nestjs/common';
import { PointsController } from './controllers/points.controller';
import { PointsService } from './services/points.service';
import { PointsRepository } from './repositories/points.repository';
import { StudentModule } from '../student/student.module';

@Module({
  imports: [StudentModule],
  controllers: [PointsController],
  providers: [PointsService, PointsRepository],
  exports: [PointsService, PointsRepository],
})
export class PointsModule {}
