import { Injectable, NotFoundException } from '@nestjs/common';
import { TeachingLogRepository, TeachingLogListResult } from './teaching-log.repository';
import { CreateTeachingLogDto } from './dto/create-teaching-log.dto';
import { UpdateTeachingLogDto } from './dto/update-teaching-log.dto';
import { TeachingLog } from '@prisma/client';

@Injectable()
export class TeachingLogService {
  constructor(private readonly teachingLogRepository: TeachingLogRepository) {}

  async findAll(
    page: number,
    pageSize: number,
    studentName?: string,
  ): Promise<TeachingLogListResult> {
    return this.teachingLogRepository.findAll(page, pageSize, studentName);
  }

  async findByStudentName(name: string): Promise<TeachingLog[]> {
    return this.teachingLogRepository.findByStudentName(name);
  }

  async create(dto: CreateTeachingLogDto): Promise<TeachingLog> {
    return this.teachingLogRepository.create(dto);
  }

  async update(id: string, dto: UpdateTeachingLogDto): Promise<TeachingLog> {
    const existing = await this.teachingLogRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Teaching log ${id} not found`);
    }
    return this.teachingLogRepository.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.teachingLogRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Teaching log ${id} not found`);
    }
    await this.teachingLogRepository.delete(id);
  }
}
