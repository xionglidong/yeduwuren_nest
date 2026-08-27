import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ConfigStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<unknown> {
    const row = await this.prisma.metaConfig.findUnique({ where: { key } });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    await this.prisma.metaConfig.upsert({
      where: { key },
      create: { key, value: valueStr },
      update: { value: valueStr },
    });
  }

  /**
   * 根据当前学年字符串（如 '2025-2026'）同步每个学生的 cohort、grade 和 lastUpdate。
   * 逻辑与前端 updateAllStudentsGradesForYear 保持一致：
   *   1. 若学生 cohort 为空，按基准学年 2025-2026 由原 grade 推算 cohort
   *   2. diff = cohort - yearStart：diff=3→高一，diff=2→高二，diff=1→高三
   *   3. 若 grade 发生变化，更新 lastUpdate 为当前时间
   */
  async syncStudentGradesForSchoolYear(schoolYear: string): Promise<void> {
    const yearStart = parseInt(schoolYear.split('-')[0], 10);
    if (isNaN(yearStart)) return;

    const BASE_YEAR = 2025; // 存量数据的基准学年起始年
    const students = await this.prisma.student.findMany();
    const nowStr = new Date().toLocaleString();

    for (const student of students) {
      let cohort = student.cohort;

      // 若 cohort 未设置，按基准学年从原 grade 推算
      if (cohort === null || cohort === undefined) {
        if (student.grade === '高一') {
          cohort = BASE_YEAR + 3;
        } else if (student.grade === '高二') {
          cohort = BASE_YEAR + 2;
        } else if (student.grade === '高三') {
          cohort = BASE_YEAR + 1;
        } else {
          cohort = BASE_YEAR + 3;
        }
      }

      const diff = cohort - yearStart;
      let newGrade = '';
      if (diff === 3) newGrade = '高一';
      else if (diff === 2) newGrade = '高二';
      else if (diff === 1) newGrade = '高三';

      const gradeChanged = student.grade !== newGrade;
      const cohortChanged = student.cohort !== cohort;

      if (gradeChanged || cohortChanged) {
        await this.prisma.student.update({
          where: { id: student.id },
          data: {
            cohort,
            grade: newGrade || student.grade,
            lastUpdate: nowStr,
          },
        });
      }
    }
  }
}
