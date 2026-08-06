import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { TimerService } from './timer.service';
import { UpsertTimerRecordDto } from './dto/upsert-timer-record.dto';
import { TimerRecord } from '@prisma/client';

@Controller('api/v1/timer')
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Put('records')
  async upsertTimerRecord(@Body() dto: UpsertTimerRecordDto): Promise<TimerRecord> {
    return this.timerService.upsertTimerRecord(dto);
  }

  /** Returns all timer records as nested map { [studentId]: { [paperId]: recordData } } */
  @Get('records')
  async getAllTimerRecords(): Promise<Record<string, Record<string, unknown>>> {
    return this.timerService.getAllTimerRecordsMap();
  }

  @Get('records/:studentId')
  async getStudentTimerRecords(
    @Param('studentId') studentId: string,
  ): Promise<Record<string, unknown>> {
    return this.timerService.getTimerRecordsByStudent(studentId);
  }
}
