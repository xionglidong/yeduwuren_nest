import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PaperRepository } from '../repositories/paper.repository';
import { StudentService } from '../../student/student.service';
import { Paper, StudentAnswer } from '@prisma/client';
import { SubmitPaperDto } from '../dto/submit-paper.dto';

export interface FormattedStudentAnswer {
  id: string;
  paperId: string;
  studentId: string;
  studentName: string;
  answers: string[];
  score: number;
  totalPoints: number;
  submitTime: string;
  timeElapsed?: number;
  isFirstSubmission: boolean;
  tag?: string;
  [key: string]: unknown;
}

@Injectable()
export class PaperService {
  private readonly logger = new Logger(PaperService.name);

  constructor(
    private readonly paperRepository: PaperRepository,
    private readonly studentService: StudentService,
  ) {}

  // ─── Papers ──────────────────────────────────────────────────────────────

  async getAllPapers(): Promise<Paper[]> {
    return this.paperRepository.findAllPapers();
  }

  async getAllPapersFormatted(): Promise<Record<string, unknown>[]> {
    return this.paperRepository.findAllPapersFormatted();
  }

  async getPaperById(id: string): Promise<Paper> {
    const paper = await this.paperRepository.findPaperById(id);
    if (!paper) throw new NotFoundException(`Paper with ID ${id} not found`);
    return paper;
  }

  async createPaper(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.paperRepository.createPaper(body);
  }

  async updatePaper(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.paperRepository.findPaperById(id);
    if (!existing) throw new NotFoundException(`Paper with ID ${id} not found`);
    return this.paperRepository.updatePaper(id, body);
  }

  async deletePaper(id: string): Promise<void> {
    const existing = await this.paperRepository.findPaperById(id);
    if (!existing) throw new NotFoundException(`Paper with ID ${id} not found`);
    await this.paperRepository.deletePaper(id);
  }

  /** Legacy: sync full paper list from frontend (used by seed) */
  async syncPapersFromFrontend(papers: Record<string, unknown>[]): Promise<void> {
    await this.paperRepository.upsertPapersFromFrontend(papers);
    const keepIds = papers.map((p) => String(p['id'] || '')).filter(Boolean);
    await this.paperRepository.deletePapersNotIn(keepIds);
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  async submitPaper(dto: SubmitPaperDto): Promise<StudentAnswer> {
    const paper = await this.paperRepository.findPaperById(dto.paperId);

    let calculatedScore = dto.score ?? 0;
    let totalPoints = dto.totalPoints ?? (paper ? paper.totalPoints : 100);

    const date = new Date(dto.submitTime ?? '');

    if(isNaN(date.getTime())) {
      dto.submitTime = ''
    }else{
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        dto.submitTime = `${y}-${m}-${d} ${h}:${min}:${s}`
    }

    if (paper) {
      totalPoints = paper.totalPoints;
      try {
        const standardAnswers: unknown[] = JSON.parse(paper.answers);
        if (Array.isArray(standardAnswers) && dto.answers) {
          let correctCount = 0;
          for (let i = 0; i < standardAnswers.length; i++) {
            const item = standardAnswers[i];
            const stdAns = typeof item === 'object' && item !== null ? String((item as Record<string, unknown>).answer ?? '') : String(item ?? '');
            if (dto.answers[i] && dto.answers[i].trim().toUpperCase() === stdAns.trim().toUpperCase()) {
              correctCount++;
            }
          }
          let mcScore = correctCount * paper.singlePoints;
          if (dto.fillInBlankScore !== undefined && typeof dto.fillInBlankScore === 'number') {
            mcScore += dto.fillInBlankScore;
          }
          if (dto.score === undefined) {
            calculatedScore = mcScore;
          }
        }
      } catch (err) {
        this.logger.warn(`Could not parse standard answers for paper ${paper.id}: ${err}`);
      }
    }

    const finalScore = typeof dto.score === 'number' ? dto.score : calculatedScore;

    // Calculate previous best score for this student & paper to determine pointsGain
    const previousSubmissions = await this.paperRepository.findSubmissionsByStudent(dto.studentId);
    const paperSubmissions = previousSubmissions.filter((s) => s.paperId === dto.paperId);
    const previousCount = paperSubmissions.length;
    const isFirstSubmission = previousCount === 0;

    const previousBestScore = paperSubmissions.reduce((best, s) => Math.max(best, s.score), 0);
    const bestScoreAfter = Math.max(previousBestScore, finalScore);
    const pointsGain = Math.max(0, bestScoreAfter - previousBestScore);

    if (pointsGain > 0 && dto.studentId) {
      try {
        const student = await this.studentService.getStudentById(dto.studentId).catch(() => null);
        const currentPoints = student ? student.points : 0;
        await this.studentService.upsertStudentPoint({
          id: dto.studentId,
          name: dto.studentName,
          points: currentPoints + pointsGain,
          lastUpdate: new Date().toLocaleString(),
        });
      } catch (e) {
        this.logger.warn(`Could not update student points on submitPaper: ${e}`);
      }
    }

    return this.paperRepository.createSubmission(dto, finalScore, totalPoints, isFirstSubmission);
  }

  async getAllSubmissions(): Promise<FormattedStudentAnswer[]> {
    const rows = await this.paperRepository.findAllSubmissions();
    return rows.map((r) => this.formatSubmission(r));
  }

  async updateSubmission(
    paperId: string,
    submissionId: string,
    body: Record<string, unknown>,
  ): Promise<FormattedStudentAnswer> {
    const submission = await this.paperRepository.findSubmissionById(submissionId);
    if (!submission || submission.paperId !== paperId) {
      throw new NotFoundException(`Submission ${submissionId} not found for paper ${paperId}`);
    }

    const updateData: Record<string, unknown> = {};
    if ('score' in body) updateData['score'] = Number(body['score']);
    if ('totalPoints' in body) updateData['totalPoints'] = Number(body['totalPoints']);
    if ('tag' in body) updateData['tag'] = body['tag'];
    if ('answers' in body) {
      updateData['answers'] = Array.isArray(body['answers'])
        ? JSON.stringify(body['answers'])
        : String(body['answers']);
    }
    for (const k of Object.keys(body)) {
      if (!['score', 'totalPoints', 'tag', 'answers'].includes(k)) {
        updateData[k] = body[k];
      }
    }

    const updated = await this.paperRepository.updateSubmission(submissionId, updateData);
    return this.formatSubmission(updated);
  }

  async deleteSubmission(paperId: string, submissionId: string): Promise<void> {
    const submission = await this.paperRepository.findSubmissionById(submissionId);
    if (!submission || (paperId && submission.paperId !== paperId)) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }
    await this.paperRepository.deleteSubmission(submissionId);
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async getAllCategories(): Promise<Record<string, unknown>[]> {
    const cats = await this.paperRepository.findAllCategories();
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      paperIds: (() => { try { return JSON.parse(c.paperIds); } catch { return []; } })(),
      isArchived: c.isArchived,
      archivedAt: c.archivedAt ?? '',
      createTime: c.createTime,
    }));
  }

  async createCategory(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cat = await this.paperRepository.createCategory(body);
    return {
      id: cat.id,
      name: cat.name,
      paperIds: (() => { try { return JSON.parse(cat.paperIds); } catch { return []; } })(),
      isArchived: cat.isArchived,
      archivedAt: cat.archivedAt ?? '',
      createTime: cat.createTime,
    };
  }

  async updateCategory(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.paperRepository.findCategoryById(id);
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    const cat = await this.paperRepository.updateCategory(id, body);
    return {
      id: cat.id,
      name: cat.name,
      paperIds: (() => { try { return JSON.parse(cat.paperIds); } catch { return []; } })(),
      isArchived: cat.isArchived,
      archivedAt: cat.archivedAt ?? '',
      createTime: cat.createTime,
    };
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.paperRepository.findCategoryById(id);
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    await this.paperRepository.deleteCategory(id);
  }

  /**
   * 按日期范围查询答题记录，可选按学生过滤
   * - dateRange 和 studentId 均不传：返回所有作答记录
   * - 仅传 studentId：返回该学生的所有作答记录
   * - 传 dateRange（可同时传 studentId）：按日期范围（含学生）过滤
   * @param dateRange  可选，["yyyy/MM/dd", "yyyy/MM/dd"]，第一个为起始，第二个为结束（均含）
   * @param studentId  可选，仅返回该学生的记录
   */
  async getSubmissionsByDateRange(
    dateRange?: string[],
    studentId?: string,
  ): Promise<FormattedStudentAnswer[]> {
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (dateRange !== undefined && dateRange !== null) {
      const DATE_RE = /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
      if (
        !Array.isArray(dateRange) ||
        dateRange.length !== 2 ||
        !DATE_RE.test(dateRange[0]) ||
        !DATE_RE.test(dateRange[1])
      ) {
        throw new Error('dateRange 必须为包含两个 "yyyy/MM/dd" 或 "yyyy-MM-dd" 字符串的数组');
      }
      [startDate, endDate] = dateRange;
    }

    const records = await this.paperRepository.findSubmissionsByDateRange(
      startDate,
      endDate,
      studentId,
    );
    return records.map((r) => this.formatSubmission(r));
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private formatSubmission(r: StudentAnswer): FormattedStudentAnswer {
    let parsedAnswers: string[] = [];
    try { parsedAnswers = JSON.parse(r.answers); } catch { parsedAnswers = []; }

    let parsedOptions: Record<string, unknown> = {};
    if (r.options) {
      try { parsedOptions = JSON.parse(r.options); } catch { parsedOptions = {}; }
    }

    return {
      id: r.id,
      paperId: r.paperId,
      studentId: r.studentId,
      studentName: r.studentName,
      answers: parsedAnswers,
      score: r.score,
      totalPoints: r.totalPoints,
      submitTime: r.submitTime,
      timeElapsed: r.timeElapsed ?? undefined,
      isFirstSubmission: r.isFirstSubmission,
      tag: r.tag ?? undefined,
      ...parsedOptions,
    };
  }
}
