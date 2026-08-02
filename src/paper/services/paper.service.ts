import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PaperRepository } from '../repositories/paper.repository';
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
}

@Injectable()
export class PaperService {
  private readonly logger = new Logger(PaperService.name);

  constructor(private readonly paperRepository: PaperRepository) {}

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

    if (paper) {
      totalPoints = paper.totalPoints;
      try {
        const standardAnswers: string[] = JSON.parse(paper.answers);
        if (Array.isArray(standardAnswers) && dto.answers) {
          let correctCount = 0;
          for (let i = 0; i < standardAnswers.length; i++) {
            if (dto.answers[i] && dto.answers[i].trim().toUpperCase() === standardAnswers[i].trim().toUpperCase()) {
              correctCount++;
            }
          }
          calculatedScore = correctCount * paper.singlePoints;
        }
      } catch (err) {
        this.logger.warn(`Could not parse standard answers for paper ${paper.id}: ${err}`);
      }
    }

    const previousCount = await this.paperRepository.countSubmissions(dto.studentId, dto.paperId);
    const isFirstSubmission = previousCount === 0;

    return this.paperRepository.createSubmission(dto, calculatedScore, totalPoints, isFirstSubmission);
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

    const updated = await this.paperRepository.updateSubmission(
      submissionId,
      updateData as Parameters<typeof this.paperRepository.updateSubmission>[1],
    );
    return this.formatSubmission(updated);
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async getAllCategories(): Promise<Record<string, unknown>[]> {
    const cats = await this.paperRepository.findAllCategories();
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      paperIds: (() => { try { return JSON.parse(c.paperIds); } catch { return []; } })(),
      createTime: c.createTime,
    }));
  }

  async createCategory(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cat = await this.paperRepository.createCategory(body);
    return {
      id: cat.id,
      name: cat.name,
      paperIds: (() => { try { return JSON.parse(cat.paperIds); } catch { return []; } })(),
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
      createTime: cat.createTime,
    };
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.paperRepository.findCategoryById(id);
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    await this.paperRepository.deleteCategory(id);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private formatSubmission(r: StudentAnswer): FormattedStudentAnswer {
    let parsedAnswers: string[] = [];
    try { parsedAnswers = JSON.parse(r.answers); } catch { parsedAnswers = []; }
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
    };
  }
}
