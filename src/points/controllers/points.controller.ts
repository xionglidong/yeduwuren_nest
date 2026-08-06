import {
  Controller, Get, Post, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { PointsService } from '../services/points.service';
import { ExchangePrize, ExchangeRecord } from '@prisma/client';
import { ExchangePrizeDto } from '../dto/exchange-prize.dto';

@Controller('api/v1/points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  // ─── Prizes ───────────────────────────────────────────────────────────────

  @Get('prizes')
  async getAllPrizes(): Promise<ExchangePrize[]> {
    return this.pointsService.getAllPrizes();
  }

  @Post('prizes')
  async createPrize(@Body() body: Record<string, unknown>): Promise<ExchangePrize> {
    return this.pointsService.createPrize(body);
  }

  @Delete('prizes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePrize(@Param('id') id: string): Promise<void> {
    return this.pointsService.deletePrize(id);
  }

  // ─── Exchange ──────────────────────────────────────────────────────────────

  @Post('exchange')
  async exchangePrize(@Body() dto: ExchangePrizeDto): Promise<ExchangeRecord> {
    return this.pointsService.exchangePrize(dto);
  }

  // ─── Records ──────────────────────────────────────────────────────────────

  @Get('records')
  async getAllExchangeRecords(): Promise<ExchangeRecord[]> {
    return this.pointsService.getAllExchangeRecords();
  }

  @Get('records/:studentId')
  async getStudentExchangeRecords(@Param('studentId') studentId: string): Promise<ExchangeRecord[]> {
    return this.pointsService.getExchangeRecordsByStudent(studentId);
  }
}
