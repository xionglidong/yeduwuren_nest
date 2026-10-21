import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PaperRepository } from '../repositories/paper.repository';
import { StudentService } from '../../student/student.service';
import { Paper, StudentAnswer } from '@prisma/client';
import { SubmitPaperDto } from '../dto/submit-paper.dto';
import { EditPaperDto } from '../dto/edit-paper.dto';

export interface FormattedStudentAnswer {
  id: string;
  paperId: string;
  studentId: string;
  studentName: string;
  answers: string[];
  score: number;
  redoScore?: number;
  totalPoints: number;
  submitTime: string;
  timeElapsed?: number;
  isFirstSubmission: boolean;
  status: number;
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

  async editPaper(id: string, dto: EditPaperDto): Promise<Record<string, unknown>> {
    const existing = await this.paperRepository.findPaperById(id);
    if (!existing) throw new NotFoundException(`Paper with ID ${id} not found`);

    const normalizedName = dto.name.trim();
    if (!normalizedName) throw new BadRequestException('套卷名称不能为空');
    const duplicate = (await this.paperRepository.findAllPapers())
      .some((paper) => paper.id !== id && paper.name.trim() === normalizedName);
    if (duplicate) throw new BadRequestException(`已存在名为“${normalizedName}”的套题`);
    if (dto.questionCount === 0 && dto.fillInBlankCount === 0) {
      throw new BadRequestException('套卷不能没有任何题目');
    }
    if (dto.answers.length !== dto.questionCount || dto.questionTypes.length !== dto.questionCount) {
      throw new BadRequestException('选择题数量与答案配置不一致');
    }
    if (dto.fillInBlankConfig.length !== dto.fillInBlankCount) {
      throw new BadRequestException('填空/简答题数量与题目配置不一致');
    }
    if (dto.fillInBlankCount > 0 && dto.fillInBlankAnswerImage.length === 0) {
      throw new BadRequestException('设置了填空/简答题时必须上传参考答案图片');
    }

    return this.paperRepository.updatePaper(id, { ...dto, name: normalizedName });
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
    const previousSubmissions = await this.paperRepository.findSubmissionsByStudent(dto.studentId);
    const paperSubmissions = previousSubmissions.filter((s) => s.paperId === dto.paperId);
    const latestSubmission = paperSubmissions[0];
    const existingPartial = paperSubmissions.find((s) => s.status === 0) ??
      (paper && latestSubmission && this.hasAddedQuestionsSinceSubmission(latestSubmission, paper)
        ? latestSubmission
        : undefined);

    if (existingPartial) {
      try {
        const persistedAnswers = JSON.parse(existingPartial.answers) as unknown[];
        dto.answers = dto.answers.map((answer, index) => {
          const persisted = persistedAnswers[index];
          return persisted !== null && persisted !== undefined && String(persisted).trim() !== ''
            ? String(persisted)
            : answer;
        });
      } catch {}

      if (existingPartial.options) {
        try {
          const persistedOptions = JSON.parse(existingPartial.options) as Record<string, unknown>;
          if (persistedOptions['fillInBlankConfirmed'] === true) {
            const submittedFillScore = typeof dto.fillInBlankScore === 'number' ? dto.fillInBlankScore : 0;
            const persistedDetails = Array.isArray(persistedOptions['fillInBlankDetails'])
              ? persistedOptions['fillInBlankDetails'] as unknown[]
              : [];
            const persistedAnswered = Array.isArray(persistedOptions['fillInBlankAnswered'])
              ? persistedOptions['fillInBlankAnswered'] as unknown[]
              : persistedDetails.map((value) => value !== null && value !== undefined && value !== '');
            const incomingDetails = Array.isArray(dto.fillInBlankDetails) ? dto.fillInBlankDetails : [];
            const incomingAnswered = Array.isArray(dto.fillInBlankAnswered) ? dto.fillInBlankAnswered : [];
            const detailCount = Math.max(
              persistedDetails.length,
              persistedAnswered.length,
              incomingDetails.length,
              incomingAnswered.length,
            );
            dto.fillInBlankDetails = Array.from({ length: detailCount }, (_, index) =>
              persistedAnswered[index] === true ? persistedDetails[index] : incomingDetails[index] ?? null,
            );
            dto.fillInBlankAnswered = Array.from({ length: detailCount }, (_, index) =>
              persistedAnswered[index] === true || incomingAnswered[index] === true,
            );
            dto.fillInBlankConfirmed = true;
            const persistedImages = Array.isArray(persistedOptions['fillInBlankStudentImage'])
              ? persistedOptions['fillInBlankStudentImage'] as unknown[]
              : [];
            const incomingImages = Array.isArray(dto.fillInBlankStudentImage) ? dto.fillInBlankStudentImage : [];
            dto.fillInBlankStudentImage = [...new Set([...persistedImages, ...incomingImages])];
            const mergedFillScore = (dto.fillInBlankDetails as unknown[]).reduce<number>(
              (sum, value, index) => sum + ((dto.fillInBlankAnswered as unknown[])[index] === true && typeof value === 'number' ? value : 0),
              0,
            );
            dto.fillInBlankScore = mergedFillScore;
            if (typeof dto.score === 'number') {
              dto.score = dto.score - submittedFillScore + mergedFillScore;
            }
          }
        } catch {}
      }
    }

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
    const status = this.calculateSubmissionStatus(dto, paper);

    // Calculate previous best score for this student & paper to determine pointsGain
    const isFirstSubmission = existingPartial
      ? existingPartial.isFirstSubmission
      : paperSubmissions.length === 0;

    const previousBestScore = paperSubmissions.reduce(
      (best, s) => Math.max(best, s.redoScore ?? s.score),
      0,
    );
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

    return this.paperRepository.createSubmission(
      dto,
      finalScore,
      totalPoints,
      isFirstSubmission,
      status,
      existingPartial?.id,
    );
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
    if ('score' in body) {
      const nextScore = Number(body['score']);
      updateData['score'] = nextScore;
      if (!submission.isFirstSubmission) updateData['redoScore'] = nextScore;
    }
    if ('redoScore' in body) {
      updateData['redoScore'] = body['redoScore'] === null ? null : Number(body['redoScore']);
    }
    if ('totalPoints' in body) updateData['totalPoints'] = Number(body['totalPoints']);
    if ('tag' in body) updateData['tag'] = body['tag'];
    if ('answers' in body) {
      updateData['answers'] = Array.isArray(body['answers'])
        ? JSON.stringify(body['answers'])
        : String(body['answers']);
    }
    for (const k of Object.keys(body)) {
      if (!['score', 'redoScore', 'totalPoints', 'tag', 'answers'].includes(k)) {
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

  // ─── Knowledge point tags ────────────────────────────────────────────────

  async getKnowledgePointTags(keyword?: string): Promise<Record<string, unknown>[]> {
    const normalizedKeyword = String(keyword ?? '').trim();
    return this.paperRepository.findKnowledgePointTags(normalizedKeyword || undefined);
  }

  async createKnowledgePointTag(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const name = this.normalizeKnowledgePointTagName(body['name']);
    if (await this.paperRepository.findKnowledgePointTagByName(name)) {
      throw new BadRequestException(`知识点标签“${name}”已存在`);
    }
    return this.paperRepository.createKnowledgePointTag(name);
  }

  async updateKnowledgePointTag(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.paperRepository.findKnowledgePointTagById(id);
    if (!existing) throw new NotFoundException(`知识点标签 ${id} 不存在`);
    const name = this.normalizeKnowledgePointTagName(body['name']);
    const duplicate = await this.paperRepository.findKnowledgePointTagByName(name);
    if (duplicate && duplicate.id !== id) {
      throw new BadRequestException(`知识点标签“${name}”已存在`);
    }
    return this.paperRepository.updateKnowledgePointTag(id, name);
  }

  async deleteKnowledgePointTag(id: string): Promise<void> {
    const existing = await this.paperRepository.findKnowledgePointTagById(id);
    if (!existing) throw new NotFoundException(`知识点标签 ${id} 不存在`);
    await this.paperRepository.deleteKnowledgePointTag(id);
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
      redoScore: r.redoScore ?? undefined,
      totalPoints: r.totalPoints,
      submitTime: r.submitTime,
      timeElapsed: r.timeElapsed ?? undefined,
      isFirstSubmission: r.isFirstSubmission,
      status: r.status,
      tag: r.tag ?? undefined,
      ...parsedOptions,
    };
  }

  private normalizeKnowledgePointTagName(value: unknown): string {
    const name = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('知识点标签名称不能为空');
    if (name.length > 50) throw new BadRequestException('知识点标签名称不能超过 50 个字符');
    return name;
  }

  private getPaperFillInBlankCount(paper: Paper): number {
    if (paper.fillInBlankConfig) {
      try {
        const config = JSON.parse(paper.fillInBlankConfig);
        if (Array.isArray(config)) return config.length;
      } catch {}
    }

    if (paper.options) {
      try {
        const options = JSON.parse(paper.options) as Record<string, unknown>;
        return Number(options['fillInBlankCount'] ?? 0) || 0;
      } catch {}
    }

    return 0;
  }

  private hasAddedQuestionsSinceSubmission(submission: StudentAnswer, paper: Paper): boolean {
    let submittedChoiceCount = 0;
    try {
      const answers = JSON.parse(submission.answers);
      if (Array.isArray(answers)) submittedChoiceCount = answers.length;
    } catch {}

    let submittedFillInBlankCount = 0;
    if (submission.options) {
      try {
        const options = JSON.parse(submission.options) as Record<string, unknown>;
        if (Array.isArray(options['fillInBlankAnswered'])) {
          submittedFillInBlankCount = options['fillInBlankAnswered'].length;
        } else if (Array.isArray(options['fillInBlankDetails'])) {
          submittedFillInBlankCount = options['fillInBlankDetails'].length;
        }
      } catch {}
    }

    return paper.questionCount > submittedChoiceCount ||
      this.getPaperFillInBlankCount(paper) > submittedFillInBlankCount;
  }

  private calculateSubmissionStatus(dto: SubmitPaperDto, paper: Paper | null): number {
    const requestedComplete = dto.status === undefined || dto.status === 1;
    if (!paper) return requestedComplete ? 1 : 0;

    const choiceComplete = Array.from({ length: paper.questionCount }).every((_, index) => {
      const answer = dto.answers[index];
      return typeof answer === 'string' && answer.trim().length > 0;
    });

    const fillInBlankCount = this.getPaperFillInBlankCount(paper);

    const images = Array.isArray(dto.fillInBlankStudentImage)
      ? dto.fillInBlankStudentImage
      : dto.fillInBlankStudentImage
        ? [dto.fillInBlankStudentImage]
        : [];
    const details = Array.isArray(dto.fillInBlankDetails) ? dto.fillInBlankDetails : [];
    const answered = Array.isArray(dto.fillInBlankAnswered)
      ? dto.fillInBlankAnswered
      : details.map((value) => value !== null && value !== undefined && value !== '');
    const fillInBlankComplete = fillInBlankCount === 0 || (
      dto.fillInBlankConfirmed === true &&
      images.length > 0 &&
      details.length >= fillInBlankCount &&
      answered.length >= fillInBlankCount &&
      answered.slice(0, fillInBlankCount).every((value) => value === true) &&
      details.slice(0, fillInBlankCount).every((value) => value !== null && value !== undefined && value !== '')
    );

    return requestedComplete && choiceComplete && fillInBlankComplete ? 1 : 0;
  }
}
