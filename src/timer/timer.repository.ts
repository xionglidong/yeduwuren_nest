import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TimerRecord } from '@prisma/client';
import { UpsertTimerRecordDto } from './dto/upsert-timer-record.dto';

@Injectable()
export class TimerRepository {
  private readonly logger = new Logger(TimerRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertTimerRecord(dto: UpsertTimerRecordDto): Promise<TimerRecord> {
    const studentId = String(dto.studentId);
    const paperId = String(dto.paperId);
    const recordJson = typeof dto.record === 'string' ? dto.record : JSON.stringify(dto.record);

    return this.prisma.timerRecord.upsert({
      where: {
        studentId_paperId: {
          studentId,
          paperId,
        },
      },
      update: {
        recordData: recordJson,
      },
      create: {
        studentId,
        paperId,
        recordData: recordJson,
      },
    });
  }

  async findByStudentId(studentId: string): Promise<Record<string, unknown>> {
    const records = await this.prisma.timerRecord.findMany({
      where: { studentId },
    });

    const result: Record<string, unknown> = {};
    for (const record of records) {
      try {
        result[record.paperId] = JSON.parse(record.recordData);
      } catch {
        result[record.paperId] = record.recordData;
      }
    }
    return result;
  }

  async findAllAsNestedMap(): Promise<Record<string, Record<string, unknown>>> {
    const records = await this.prisma.timerRecord.findMany();
    const map: Record<string, Record<string, unknown>> = {};

    for (const record of records) {
      if (!map[record.studentId]) {
        map[record.studentId] = {};
      }
      try {
        map[record.studentId][record.paperId] = JSON.parse(record.recordData);
      } catch {
        map[record.studentId][record.paperId] = record.recordData;
      }
    }
    return map;
  }
}
