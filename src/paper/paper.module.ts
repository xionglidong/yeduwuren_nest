import { Module } from '@nestjs/common';
import { PaperController } from './controllers/paper.controller';
import { PaperService } from './services/paper.service';
import { PaperRepository } from './repositories/paper.repository';
import { StudentModule } from '../student/student.module';

@Module({
  imports: [StudentModule],
  controllers: [PaperController],
  providers: [PaperService, PaperRepository],
  exports: [PaperService, PaperRepository],
})
export class PaperModule {}
