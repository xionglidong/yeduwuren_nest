import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Paper, StudentAnswer, PaperCategory } from '@prisma/client';
import { SubmitPaperDto } from '../dto/submit-paper.dto';

// Fields that Paper table stores directly (rest go into `options` JSON column)
const PAPER_DIRECT_FIELDS = new Set([
  'id', 'grade', 'name', 'questionCount', 'singlePoints', 'totalPoints', 'answers',
  'categoryId', 'createTime', 'createdAt',
]);

/** Build a formatted paper object merging `options` back into top-level fields */
function formatPaper(p: Paper): Record<string, unknown> {
  let opts: Record<string, unknown> = {};
  try { opts = p.options ? JSON.parse(p.options) : {}; } catch { opts = {}; }
  return {
    id: p.id,
    grade: p.grade,
    name: p.name,
    questionCount: p.questionCount,
    singlePoints: p.singlePoints,
    totalPoints: p.totalPoints,
    answers: (() => { try { return JSON.parse(p.answers); } catch { return []; } })(),
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

  return {
    grade: String(body['grade'] ?? ''),
    name: String(body['name'] ?? ''),
    questionCount: Number(body['questionCount'] ?? 0),
    singlePoints: Number(body['singlePoints'] ?? 0),
    totalPoints: Number(body['totalPoints'] ?? 0),
    answers: answersStr,
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
      },
    });
  }

  async findSubmissionById(id: string): Promise<StudentAnswer | null> {
    return this.prisma.studentAnswer.findUnique({ where: { id } });
  }

  async updateSubmission(id: string, data: Partial<{
    answers: string; score: number; totalPoints: number;
    submitTime: string; timeElapsed: number | null; isFirstSubmission: boolean;
    tag: string;
  }>): Promise<StudentAnswer> {
    return this.prisma.studentAnswer.update({ where: { id }, data });
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
    return this.prisma.paperCategory.update({
      where: { id },
      data: data as Parameters<typeof this.prisma.paperCategory.update>[0]['data'],
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.prisma.paperCategory.delete({ where: { id } });
  }
}
