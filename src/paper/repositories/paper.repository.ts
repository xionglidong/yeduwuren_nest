import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Paper, StudentAnswer, PaperCategory } from '@prisma/client';
import { SubmitPaperDto } from '../dto/submit-paper.dto';

// Fields that Paper table stores directly (rest go into `options` JSON column)
const PAPER_DIRECT_FIELDS = new Set([
  'id', 'grade', 'name', 'questionCount', 'singlePoints', 'totalPoints', 'answers',
  'fillInBlankConfig', 'categoryId', 'createTime', 'createdAt',
]);

/** Build a formatted paper object merging `options` back into top-level fields */
function formatPaper(p: Paper): Record<string, unknown> {
  let opts: Record<string, unknown> = {};
  try { opts = p.options ? JSON.parse(p.options) : {}; } catch { opts = {}; }

  let answers: unknown[] = [];
  try { answers = JSON.parse(p.answers); } catch { answers = []; }

  let fillInBlankConfig: Record<string, unknown>[] | null = null;
  if (p.fillInBlankConfig) {
    try { fillInBlankConfig = JSON.parse(p.fillInBlankConfig); } catch { fillInBlankConfig = null; }
  } else if (opts['fillInBlankConfig']) {
    fillInBlankConfig = Array.isArray(opts['fillInBlankConfig']) ? (opts['fillInBlankConfig'] as Record<string, unknown>[]) : null;
  }

  // Backwards-compatibility fallbacks
  let fillInBlankCount = typeof opts['fillInBlankCount'] === 'number' ? opts['fillInBlankCount'] : (parseInt(String(opts['fillInBlankCount'] || 0), 10) || 0);
  let fbPointsArray = Array.isArray(opts['fbPointsArray']) ? opts['fbPointsArray'] : [];
  let fillBlankVideos = Array.isArray(opts['fillBlankVideos']) ? opts['fillBlankVideos'] : [];

  if (Array.isArray(fillInBlankConfig)) {
    fillInBlankCount = fillInBlankConfig.length;
    fbPointsArray = fillInBlankConfig.map((item: Record<string, unknown>) => Number(item['points'] ?? 0));
    fillBlankVideos = fillInBlankConfig.map((item: Record<string, unknown>) => String(item['video'] ?? ''));
  } else {
    // Build dynamic fillInBlankConfig from legacy fields if needed
    if (fillInBlankCount > 0) {
      fillInBlankConfig = [];
      const defaultPt = Number(opts['fillInBlankPoints'] ?? 5);
      for (let i = 0; i < fillInBlankCount; i++) {
        fillInBlankConfig.push({
          points: fbPointsArray[i] !== undefined ? Number(fbPointsArray[i]) : defaultPt,
          video: fillBlankVideos[i] ? String(fillBlankVideos[i]) : '',
          tags: {},
        });
      }
    } else {
      fillInBlankConfig = [];
    }
  }

  return {
    id: p.id,
    grade: p.grade,
    name: p.name,
    questionCount: p.questionCount,
    singlePoints: p.singlePoints,
    totalPoints: p.totalPoints,
    answers,
    fillInBlankConfig,
    fillInBlankCount,
    fbPointsArray,
    fillBlankVideos,
    categoryId: p.categoryId ?? '',
    createTime: p.createTime,
    ...opts,
  };
}

/** Extract direct column data + pack extra fields into `options` */
function packPaper(body: Record<string, unknown>) {
  const opts: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PAPER_DIRECT_FIELDS.has(k)) opts[k] = v;
  }
  const answersStr = Array.isArray(body['answers'])
    ? JSON.stringify(body['answers'])
    : String(body['answers'] ?? '[]');

  let fillInBlankConfigStr: string | null = null;
  if (body['fillInBlankConfig'] !== undefined && body['fillInBlankConfig'] !== null) {
    fillInBlankConfigStr = Array.isArray(body['fillInBlankConfig'])
      ? JSON.stringify(body['fillInBlankConfig'])
      : String(body['fillInBlankConfig']);
  }

  return {
    grade: String(body['grade'] ?? ''),
    name: String(body['name'] ?? ''),
    questionCount: Number(body['questionCount'] ?? 0),
    singlePoints: Number(body['singlePoints'] ?? 0),
    totalPoints: Number(body['totalPoints'] ?? 0),
    answers: answersStr,
    fillInBlankConfig: fillInBlankConfigStr,
    categoryId: body['categoryId'] ? String(body['categoryId']) : null,
    createTime: String(body['createTime'] ?? new Date().toLocaleString()),
    options: JSON.stringify(opts),
  };
}

@Injectable()
export class PaperRepository {
  private readonly logger = new Logger(PaperRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Papers ──────────────────────────────────────────────────────────────

  async findPaperById(id: string): Promise<Paper | null> {
    return this.prisma.paper.findUnique({ where: { id } });
  }

  async findAllPapers(): Promise<Paper[]> {
    return this.prisma.paper.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findAllPapersFormatted(): Promise<Record<string, unknown>[]> {
    const papers = await this.prisma.paper.findMany({ orderBy: { createdAt: 'desc' } });
    return papers.map(formatPaper);
  }

  async createPaper(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = String(body['id'] || `p${Date.now()}`);
    const data = packPaper(body);
    const paper = await this.prisma.paper.create({ data: { id, ...data } });
    return formatPaper(paper);
  }

  async updatePaper(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Fetch existing first so we can merge options
    const existing = await this.prisma.paper.findUnique({ where: { id } });
    let existingOpts: Record<string, unknown> = {};
    try { existingOpts = existing?.options ? JSON.parse(existing.options) : {}; } catch { existingOpts = {}; }

    // Compute new opts = merge existing + new extra fields
    const newOpts: Record<string, unknown> = { ...existingOpts };
    for (const [k, v] of Object.entries(body)) {
      if (!PAPER_DIRECT_FIELDS.has(k)) newOpts[k] = v;
    }

    const directUpdate: Record<string, unknown> = { options: JSON.stringify(newOpts) };
    for (const field of PAPER_DIRECT_FIELDS) {
      if (field in body && field !== 'id' && field !== 'createdAt') {
        if (field === 'answers') {
          directUpdate[field] = Array.isArray(body[field])
            ? JSON.stringify(body[field])
            : String(body[field] ?? '[]');
        } else if (field === 'fillInBlankConfig') {
          directUpdate[field] = body[field] !== undefined && body[field] !== null
            ? (Array.isArray(body[field]) ? JSON.stringify(body[field]) : String(body[field]))
            : null;
        } else if (field === 'categoryId') {
          directUpdate[field] = body[field] ? String(body[field]) : null;
        } else if (['questionCount', 'singlePoints', 'totalPoints'].includes(field)) {
          directUpdate[field] = Number(body[field] ?? 0);
        } else {
          directUpdate[field] = body[field];
        }
      }
    }

    const paper = await this.prisma.paper.update({
      where: { id },
      data: directUpdate as Parameters<typeof this.prisma.paper.update>[0]['data'],
    });
    return formatPaper(paper);
  }

  async deletePaper(id: string): Promise<void> {
    await this.prisma.paper.delete({ where: { id } });
  }

  /** Batch upsert — kept for seed compatibility */
  async upsertPapersFromFrontend(papers: Record<string, unknown>[]): Promise<void> {
    for (const p of papers) {
      const id = String(p['id'] || '');
      if (!id) continue;
      const data = packPaper(p);
      await this.prisma.paper.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
  }

  async deletePapersNotIn(keepIds: string[]): Promise<void> {
    await this.prisma.paper.deleteMany({ where: { id: { notIn: keepIds } } });
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  async createSubmission(
    dto: SubmitPaperDto,
    score: number,
    totalPoints: number,
    isFirstSubmission: boolean,
  ): Promise<StudentAnswer> {
    const submitTimeStr = dto.submitTime || new Date().toISOString().replace('T', ' ').substring(0, 19);
    const optionsObj: Record<string, unknown> = {};
    if (dto.fillInBlankDetails !== undefined) optionsObj['fillInBlankDetails'] = dto.fillInBlankDetails;
    if (dto.fillInBlankStudentImage !== undefined) optionsObj['fillInBlankStudentImage'] = dto.fillInBlankStudentImage;
    if (dto.fillInBlankScore !== undefined) optionsObj['fillInBlankScore'] = dto.fillInBlankScore;
    if (dto.draftImages !== undefined) optionsObj['draftImages'] = dto.draftImages;
    if (dto.correctionImages !== undefined) optionsObj['correctionImages'] = dto.correctionImages;
    if (dto.correctionTime !== undefined) optionsObj['correctionTime'] = dto.correctionTime;
    if (dto.recommendedTime !== undefined) optionsObj['recommendedTime'] = dto.recommendedTime;
    if (dto.interimEvents !== undefined) optionsObj['interimEvents'] = dto.interimEvents;
    if (dto.actualTimeElapsed !== undefined) optionsObj['actualTimeElapsed'] = dto.actualTimeElapsed;
    if (dto.totalPauseDuration !== undefined) optionsObj['totalPauseDuration'] = dto.totalPauseDuration;
    if (dto.pauseCount !== undefined) optionsObj['pauseCount'] = dto.pauseCount;
    if (dto.pauseIntervals !== undefined) optionsObj['pauseIntervals'] = dto.pauseIntervals;

    return this.prisma.studentAnswer.create({
      data: {
        paperId: dto.paperId,
        studentId: dto.studentId,
        studentName: dto.studentName,
        answers: JSON.stringify(dto.answers),
        score,
        totalPoints,
        submitTime: submitTimeStr,
        timeElapsed: dto.timeElapsed ?? null,
        isFirstSubmission,
        options: Object.keys(optionsObj).length > 0 ? JSON.stringify(optionsObj) : null,
      },
    });
  }

  async findSubmissionById(id: string): Promise<StudentAnswer | null> {
    return this.prisma.studentAnswer.findUnique({ where: { id } });
  }

  async updateSubmission(
    id: string,
    data: Record<string, unknown>,
  ): Promise<StudentAnswer> {
    const existing = await this.prisma.studentAnswer.findUnique({ where: { id } });
    if (!existing) throw new Error(`Submission ${id} not found`);

    let existingOptions: Record<string, unknown> = {};
    if (existing.options) {
      try { existingOptions = JSON.parse(existing.options); } catch { existingOptions = {}; }
    }

    const directFields = ['answers', 'score', 'totalPoints', 'submitTime', 'timeElapsed', 'isFirstSubmission', 'tag'];
    const updatePayload: Record<string, unknown> = {};

    for (const key of Object.keys(data)) {
      if (directFields.includes(key)) {
        updatePayload[key] = data[key];
      } else {
        existingOptions[key] = data[key];
      }
    }

    if (Object.keys(existingOptions).length > 0) {
      updatePayload['options'] = JSON.stringify(existingOptions);
    }

    return this.prisma.studentAnswer.update({ where: { id }, data: updatePayload });
  }

  async findSubmissionsByStudent(studentId: string): Promise<StudentAnswer[]> {
    return this.prisma.studentAnswer.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
  }

  async findAllSubmissions(): Promise<StudentAnswer[]> {
    return this.prisma.studentAnswer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async countSubmissions(studentId: string, paperId: string): Promise<number> {
    return this.prisma.studentAnswer.count({ where: { studentId, paperId } });
  }

  async deleteSubmission(id: string): Promise<void> {
    await this.prisma.studentAnswer.delete({ where: { id } });
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async findAllCategories(): Promise<PaperCategory[]> {
    return this.prisma.paperCategory.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findCategoryById(id: string): Promise<PaperCategory | null> {
    return this.prisma.paperCategory.findUnique({ where: { id } });
  }

  async createCategory(body: Record<string, unknown>): Promise<PaperCategory> {
    return this.prisma.paperCategory.create({
      data: {
        name: String(body['name'] ?? ''),
        paperIds: Array.isArray(body['paperIds'])
          ? JSON.stringify(body['paperIds'])
          : String(body['paperIds'] ?? '[]'),
        isArchived: Boolean(body['isArchived'] ?? false),
        archivedAt: body['archivedAt'] !== undefined ? String(body['archivedAt']) : null,
        createTime: String(body['createTime'] ?? new Date().toLocaleString()),
      },
    });
  }

  async updateCategory(id: string, body: Record<string, unknown>): Promise<PaperCategory> {
    const data: Record<string, unknown> = {};
    if ('name' in body) data['name'] = String(body['name']);
    if ('paperIds' in body) {
      data['paperIds'] = Array.isArray(body['paperIds'])
        ? JSON.stringify(body['paperIds'])
        : String(body['paperIds'] ?? '[]');
    }
    if ('isArchived' in body) data['isArchived'] = Boolean(body['isArchived']);
    if ('archivedAt' in body) data['archivedAt'] = body['archivedAt'] ? String(body['archivedAt']) : '';
    return this.prisma.paperCategory.update({
      where: { id },
      data: data as Parameters<typeof this.prisma.paperCategory.update>[0]['data'],
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.prisma.paperCategory.delete({ where: { id } });
  }
}
