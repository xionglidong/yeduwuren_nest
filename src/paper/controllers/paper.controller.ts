import {
  Controller, Get, Post, Put, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { PaperService, FormattedStudentAnswer } from '../services/paper.service';
import { Paper, StudentAnswer } from '@prisma/client';
import { SubmitPaperDto } from '../dto/submit-paper.dto';

@Controller('api/v1/papers')
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  // ─── Papers ──────────────────────────────────────────────────────────────

  @Get()
  async getAllPapers(): Promise<Record<string, unknown>[]> {
    return this.paperService.getAllPapersFormatted();
  }

  @Post()
  async createPaper(@Body() body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.paperService.createPaper(body);
  }

  @Put(':id')
  async updatePaper(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.paperService.updatePaper(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePaper(@Param('id') id: string): Promise<void> {
    return this.paperService.deletePaper(id);
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  @Get('submissions/records')
  async getAllSubmissions(): Promise<FormattedStudentAnswer[]> {
    return this.paperService.getAllSubmissions();
  }

  @Post(':id/submissions')
  async submitPaper(
    @Param('id') paperId: string,
    @Body() dto: SubmitPaperDto,
  ): Promise<StudentAnswer> {
    return this.paperService.submitPaper({ ...dto, paperId });
  }

  @Put(':paperId/submissions/:submissionId')
  async updateSubmission(
    @Param('paperId') paperId: string,
    @Param('submissionId') submissionId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<FormattedStudentAnswer> {
    return this.paperService.updateSubmission(paperId, submissionId, body);
  }

  @Delete(':paperId/submissions/:submissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubmission(
    @Param('paperId') paperId: string,
    @Param('submissionId') submissionId: string,
  ): Promise<void> {
    return this.paperService.deleteSubmission(paperId, submissionId);
  }

  @Delete('submissions/:submissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubmissionDirect(
    @Param('submissionId') submissionId: string,
  ): Promise<void> {
    return this.paperService.deleteSubmission('', submissionId);
  }

  // ─── Paper by ID (must be last to avoid swallowing named sub-routes) ──────

  @Get(':id')
  async getPaperById(@Param('id') id: string): Promise<Paper> {
    return this.paperService.getPaperById(id);
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  @Get('categories/list')
  async getAllCategories(): Promise<Record<string, unknown>[]> {
    return this.paperService.getAllCategories();
  }

  @Post('categories')
  async createCategory(@Body() body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.paperService.createCategory(body);
  }

  @Put('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.paperService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(@Param('id') id: string): Promise<void> {
    return this.paperService.deleteCategory(id);
  }
}
