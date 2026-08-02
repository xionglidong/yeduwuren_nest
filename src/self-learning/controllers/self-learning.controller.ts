import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SelfLearningService, FormattedForumPost } from '../services/self-learning.service';
import { SelfLearningContent, SelfLearningWatchStat, ForumResourceMaterial } from '@prisma/client';
import { CreateForumPostDto } from '../dto/create-forum-post.dto';
import { RecordWatchStatDto } from '../dto/record-watch-stat.dto';

@Controller('api/v1/self-learning')
export class SelfLearningController {
  constructor(private readonly selfLearningService: SelfLearningService) {}

  // ─── Contents ─────────────────────────────────────────────────────────────

  @Get('contents')
  async getAllContents(): Promise<SelfLearningContent[]> {
    return this.selfLearningService.getAllContents();
  }

  @Post('contents')
  async createContent(@Body() body: Record<string, unknown>): Promise<SelfLearningContent> {
    return this.selfLearningService.createContent(body);
  }

  @Delete('contents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContent(@Param('id') id: string): Promise<void> {
    return this.selfLearningService.deleteContent(id);
  }

  // ─── Watch Stats ──────────────────────────────────────────────────────────

  @Get('watch-stats')
  async getWatchStatsMap(): Promise<Record<string, Record<string, number>>> {
    return this.selfLearningService.getWatchStatsMap();
  }

  @Post('watch-stats')
  async recordWatchStat(@Body() dto: RecordWatchStatDto): Promise<SelfLearningWatchStat> {
    return this.selfLearningService.recordWatchStat(dto);
  }

  @Put('watch-stats/batch')
  async batchUpdateWatchStats(@Body() body: Record<string, Record<string, number>>): Promise<{ status: string }> {
    await this.selfLearningService.batchUpdateWatchStats(body);
    return { status: 'success' };
  }

  // ─── Interactions ─────────────────────────────────────────────────────────

  @Get('interactions')
  async getInteractions(): Promise<unknown> {
    return this.selfLearningService.getInteractions();
  }

  @Put('interactions')
  async updateInteractions(@Body() body: unknown): Promise<{ status: string }> {
    await this.selfLearningService.updateInteractions(body);
    return { status: 'success' };
  }

  // ─── Forum Posts ──────────────────────────────────────────────────────────

  @Get('forum/posts')
  async getForumPosts(): Promise<FormattedForumPost[]> {
    return this.selfLearningService.getForumPosts();
  }

  @Post('forum/posts')
  async createForumPost(@Body() dto: CreateForumPostDto): Promise<FormattedForumPost> {
    return this.selfLearningService.createForumPost(dto);
  }

  @Post('forum/posts/:id/like')
  async toggleLikePost(
    @Param('id') postId: string,
    @Body('studentId') studentId: string,
  ): Promise<FormattedForumPost> {
    return this.selfLearningService.toggleLikePost(postId, studentId);
  }

  // ─── Materials ────────────────────────────────────────────────────────────

  @Get('materials')
  async getAllMaterials(): Promise<ForumResourceMaterial[]> {
    return this.selfLearningService.getAllMaterials();
  }

  @Post('materials')
  async createMaterial(@Body() body: Record<string, unknown>): Promise<ForumResourceMaterial> {
    return this.selfLearningService.createMaterial(body);
  }

  @Delete('materials/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMaterial(@Param('id') id: string): Promise<void> {
    return this.selfLearningService.deleteMaterial(id);
  }
}
