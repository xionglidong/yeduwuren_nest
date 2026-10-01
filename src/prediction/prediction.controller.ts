import { Controller, Get, Param, Query } from '@nestjs/common';
import { PredictionService, PhaseTargetPrediction } from './prediction.service';

@Controller('api/v1/prediction')
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Get('phase-target/:studentId')
  async getPhaseTarget(
    @Param('studentId') studentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<PhaseTargetPrediction> {
    return this.predictionService.predictPhaseTarget(studentId, startDate, endDate);
  }
}
