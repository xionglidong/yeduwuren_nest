import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { StudentRepository } from './student.repository';
import { PredictionModule } from '../prediction/prediction.module';

@Module({
  imports: [PredictionModule],
  controllers: [StudentController],
  providers: [StudentService, StudentRepository],
  exports: [StudentService, StudentRepository],
})
export class StudentModule {}
