import { Module } from '@nestjs/common';
import { PaperController } from './controllers/paper.controller';
import { PaperService } from './services/paper.service';
import { PaperRepository } from './repositories/paper.repository';

@Module({
  controllers: [PaperController],
  providers: [PaperService, PaperRepository],
  exports: [PaperService, PaperRepository],
})
export class PaperModule {}
