import { Injectable } from '@nestjs/common';
import { TimerRepository } from './timer.repository';
import { TimerRecord } from '@prisma/client';
import { UpsertTimerRecordDto } from './dto/upsert-timer-record.dto';

@Injectable()
export class TimerService {
  constructor(private readonly timerRepository: TimerRepository) {}

  async upsertTimerRecord(dto: UpsertTimerRecordDto): Promise<TimerRecord> {
    return this.timerRepository.upsertTimerRecord(dto);
  }

  async getTimerRecordsByStudent(studentId: string): Promise<Record<string, unknown>> {
    return this.timerRepository.findByStudentId(studentId);
  }

  async getAllTimerRecordsMap(): Promise<Record<string, Record<string, unknown>>> {
    return this.timerRepository.findAllAsNestedMap();
  }
}
