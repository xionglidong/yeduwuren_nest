import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Student } from '@prisma/client';
import { UpdateStudentPointsDto } from './dto/update-student-points.dto';

@Injectable()
export class StudentRepository {
  private readonly logger = new Logger(StudentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Student | null> {
    return this.prisma.student.findUnique({
      where: { id },
    });
  }

  async findAll(): Promise<Student[]> {
    return this.prisma.student.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findAllAsMap(): Promise<Record<string, Partial<Student>>> {
    const students = await this.findAll();
    const map: Record<string, Partial<Student>> = {};
    for (const student of students) {
      map[student.id] = {
        id: student.id,
        name: student.name,
        grade: student.grade,
        points: student.points,
        learningPower: student.learningPower,
        cohort: student.cohort ?? undefined,
        lastUpdate: student.lastUpdate ?? undefined,
      };
    }
    return map;
  }

  async upsertStudentPoint(dto: UpdateStudentPointsDto): Promise<Student> {
    const studentId = String(dto.id);
    const existing = await this.findById(studentId);

    const nowStr = dto.lastUpdate || new Date().toLocaleString();

    if (existing) {
      return this.prisma.student.update({
        where: { id: studentId },
        data: {
          name: dto.name ?? existing.name,
          grade: dto.grade ?? existing.grade,
          points: dto.points !== undefined ? dto.points : existing.points,
          learningPower: dto.learningPower !== undefined ? dto.learningPower : existing.learningPower,
          cohort: dto.cohort !== undefined ? dto.cohort : existing.cohort,
          lastUpdate: nowStr,
        },
      });
    }

    return this.prisma.student.create({
      data: {
        id: studentId,
        name: dto.name || `Student_${studentId}`,
        grade: dto.grade || '未设置',
        points: dto.points || 0,
        learningPower: dto.learningPower || 1.0,
        cohort: dto.cohort ?? null,
        lastUpdate: nowStr,
      },
    });
  }
}
