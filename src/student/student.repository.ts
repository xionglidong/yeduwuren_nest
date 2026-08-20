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
        isArchived: student.isArchived,
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
          isArchived: dto.isArchived !== undefined ? dto.isArchived : existing.isArchived,
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
        isArchived: dto.isArchived ?? false,
        lastUpdate: nowStr,
      },
    });
  }

  async updateLearningPower(id: string, learningPower: number): Promise<void> {
    await this.prisma.student.update({
      where: { id },
      data: { learningPower },
    });
  }

  async deleteStudent(id: string): Promise<void> {
    await this.prisma.student.delete({
      where: { id },
    });
  }

  /**
   * 按指定字段降序返回前 limit 名学生
   * @param field  Student 表中允许排序的字段名
   * @param limit  返回数量上限
   */
  async findTopByField(field: string, limit: number): Promise<Student[]> {
    return this.prisma.student.findMany({
      orderBy: { [field]: 'desc' },
      take: limit,
    });
  }

  /**
   * 获取学生综合统计信息及各项排名
   * 包含：姓名、年级、学号、积分、学力、做题总数、正确率、学习时长及其排名
   */
  async getStudentInfo(id: string): Promise<{
    id: string;
    name: string;
    grade: string;
    points: number;
    learningPower: number;
    pointsRank: number;
    learningPowerRank: number;
    totalQuestions: number;
    totalQuestionsRank: number;
    accuracy: number;
    accuracyRank: number;
    studyDuration: number;
    studyDurationRank: number;
  } | null> {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) return null;

    // 获取所有学生的提交记录，用于统计和排名
    const allStudents = await this.prisma.student.findMany();
    const allAnswers = await this.prisma.studentAnswer.findMany();

    // 按学生分组统计提交记录
    type StudentStat = {
      totalQuestions: number;
      totalScore: number;
      totalPoints: number;
      studyDuration: number;
    };
    const statMap = new Map<string, StudentStat>();

    for (const s of allStudents) {
      statMap.set(s.id, {
        totalQuestions: 0,
        totalScore: 0,
        totalPoints: 0,
        studyDuration: 0,
      });
    }

    for (const ans of allAnswers) {
      const stat = statMap.get(ans.studentId);
      if (!stat) continue;
      // 只统计首次提交，避免重复刷题
      if (ans.isFirstSubmission) {
        stat.totalQuestions += 1;
        stat.totalScore += ans.score;
        stat.totalPoints += ans.totalPoints;
        stat.studyDuration += ans.timeElapsed ?? 0;
      }
    }

    // 计算每个学生的正确率
    const getAccuracy = (stat: StudentStat): number => {
      if (stat.totalPoints === 0) return 0;
      return (stat.totalScore / stat.totalPoints) * 100;
    };

    // 计算排名（降序，相同值并列）
    const getRank = (
      studentId: string,
      getValue: (s: typeof allStudents[0], stat: StudentStat) => number,
    ): number => {
      const myValue = getValue(
        allStudents.find((s) => s.id === studentId)!,
        statMap.get(studentId)!,
      );
      let rank = 1;
      for (const s of allStudents) {
        const v = getValue(s, statMap.get(s.id)!);
        if (v > myValue) rank++;
      }
      return rank;
    };

    const myStat = statMap.get(id)!;

    const pointsRank = getRank(id, (s) => s.points);
    const learningPowerRank = getRank(id, (s) => s.learningPower);
    const totalQuestionsRank = getRank(id, (_, stat) => stat.totalQuestions);
    const accuracyRank = getRank(id, (_, stat) => getAccuracy(stat));
    const studyDurationRank = getRank(id, (_, stat) => stat.studyDuration);

    return {
      id: student.id,
      name: student.name,
      grade: student.grade,
      points: student.points,
      learningPower: student.learningPower,
      pointsRank,
      learningPowerRank,
      totalQuestions: myStat.totalQuestions,
      totalQuestionsRank,
      accuracy: Math.round(getAccuracy(myStat) * 100) / 100,
      accuracyRank,
      studyDuration: myStat.studyDuration,
      studyDurationRank,
    };
  }
}
