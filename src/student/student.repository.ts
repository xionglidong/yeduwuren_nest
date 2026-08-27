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

  async findAllAsMap(): Promise<Record<string, Omit<Partial<Student>, 'schoolScores'> & { schoolScores: unknown[] }>> {
    const students = await this.findAll();
    const map: Record<string, Omit<Partial<Student>, 'schoolScores'> & { schoolScores: unknown[] }> = {};
    for (const student of students) {
      let schoolScores: unknown[] = [];
      if (student.schoolScores) {
        try {
          const parsed = JSON.parse(student.schoolScores);
          if (Array.isArray(parsed)) schoolScores = parsed;
        } catch {
          // 解析失败时返回空数组
        }
      }
      map[student.id] = {
        id: student.id,
        name: student.name,
        grade: student.grade,
        points: student.points,
        learningPower: student.learningPower,
        cohort: student.cohort ?? undefined,
        isArchived: student.isArchived,
        lastUpdate: student.lastUpdate ?? undefined,
        gaokaoScore: student.gaokaoScore ?? '',
        schoolScores,
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
          gaokaoScore: dto.gaokaoScore ?? existing.gaokaoScore,
          schoolScores: JSON.stringify(dto.schoolScores) ?? existing.schoolScores,
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
   *
   * 做题总数 / 正确率统计逻辑与前端 summarizeStudentStats 对齐：
   *   - 选择题：逐题比对学生答案与标准答案，stdVal 为空则跳过
   *   - 填空题：按 fillInBlankDetails（boolean[]）逐项统计
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

    // 获取所有学生、所有答题记录、所有试卷（用于标准答案和填空题数）
    const allStudents = await this.prisma.student.findMany();
    const allAnswers = await this.prisma.studentAnswer.findMany();
    const allPapers = await this.prisma.paper.findMany();

    // 建立 paperId -> paper 映射
    type PaperInfo = {
      standardAnswers: unknown[];   // 标准答案数组，元素可能是字符串或 { answer, ... }
      fillInBlankCount: number;
    };
    const paperMap = new Map<string, PaperInfo>();
    for (const p of allPapers) {
      let standardAnswers: unknown[] = [];
      try { standardAnswers = JSON.parse(p.answers); } catch { standardAnswers = []; }

      // fillInBlankCount 优先取 options.fillInBlankCount，其次 fillInBlankConfig 长度
      let fillInBlankCount = 0;
      if (p.fillInBlankConfig) {
        try {
          const cfg = JSON.parse(p.fillInBlankConfig);
          if (Array.isArray(cfg)) fillInBlankCount = cfg.length;
        } catch { /* ignore */ }
      }
      if (fillInBlankCount === 0 && p.options) {
        try {
          const opts = JSON.parse(p.options);
          fillInBlankCount = Number(opts['fillInBlankCount'] ?? 0) || 0;
        } catch { /* ignore */ }
      }

      paperMap.set(p.id, { standardAnswers, fillInBlankCount });
    }

    // 按学生分组，逐题统计（与前端 summarizeStudentStats 对齐）
    type StudentStat = {
      totalQuestions: number;
      totalScore: number;
      totalPoints: number;
      studyDuration: number;
    };
    const statMap = new Map<string, StudentStat>();
    for (const s of allStudents) {
      statMap.set(s.id, { totalQuestions: 0, totalScore:0, totalPoints:0, studyDuration: 0 });
    }

    for (const ans of allAnswers) {
      const stat = statMap.get(ans.studentId);
      if (!stat) continue;
      // 只统计首次提交，避免重复刷题
      if (!ans.isFirstSubmission) continue;

      const paper = paperMap.get(ans.paperId);
      if (!paper) continue;

      stat.studyDuration += ans.timeElapsed ?? 0;

      // ① 选择题
      paper.standardAnswers.forEach((std, index) => {
        stat.totalQuestions++;
      });

      // ② 填空题：按 fillInBlankDetails 逐项统计
      if (paper.fillInBlankCount > 0) {
        for (let i = 0; i < paper.fillInBlankCount; i++) {
          stat.totalQuestions++;
        }
      }
      stat.totalScore += ans.score;
      stat.totalPoints += ans.totalPoints;
      stat.studyDuration += ans.timeElapsed ?? 0;
    }

    // 计算正确率（整数百分比，与前端一致）
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
