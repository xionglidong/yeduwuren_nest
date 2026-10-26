import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TeachingLog } from '@prisma/client';
import { CreateTeachingLogDto } from './dto/create-teaching-log.dto';
import { UpdateTeachingLogDto } from './dto/update-teaching-log.dto';

export interface TeachingLogListResult {
  list: TeachingLog[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class TeachingLogRepository {
  private readonly logger = new Logger(TeachingLogRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    page: number,
    pageSize: number,
    studentName?: string,
    className?: string,
    logDate?: string,
  ): Promise<TeachingLogListResult> {
    const where = this.buildWhere(studentName, className, logDate);
    const [list, total] = await Promise.all([
      this.prisma.teachingLog.findMany({
        where,
        orderBy: [{ logDate: 'desc' }, { startTime: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.teachingLog.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: string): Promise<TeachingLog | null> {
    return this.prisma.teachingLog.findUnique({ where: { id } });
  }

  async findByStudentName(name: string): Promise<TeachingLog[]> {
    return this.prisma.teachingLog.findMany({
      where: { studentName: { contains: name } },
      orderBy: [{ logDate: 'desc' }, { startTime: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateTeachingLogDto): Promise<TeachingLog> {
    return this.prisma.teachingLog.create({
      data: {
        studentId: dto.studentId || null,
        studentName: dto.studentName || null,
        logDate: dto.logDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        paperId: dto.paperId || null,
        content: dto.content,
      },
    });
  }

  async update(id: string, dto: UpdateTeachingLogDto): Promise<TeachingLog> {
    return this.prisma.teachingLog.update({
      where: { id },
      data: {
        ...(dto.studentId !== undefined && { studentId: dto.studentId || null }),
        ...(dto.studentName !== undefined && { studentName: dto.studentName || null }),
        ...(dto.logDate !== undefined && { logDate: dto.logDate }),
        ...(dto.startTime !== undefined && { startTime: dto.startTime }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime }),
        ...(dto.paperId !== undefined && { paperId: dto.paperId || null }),
        ...(dto.content !== undefined && { content: dto.content }),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.teachingLog.delete({ where: { id } });
  }

  private buildWhere(studentName?: string, className?: string, logDate?: string) {
    const nameFilter = (className || studentName || '').trim();
    return {
      ...(nameFilter && { studentName: { contains: nameFilter } }),
      ...(logDate?.trim() && { logDate: logDate.trim() }),
    };
  }
}
