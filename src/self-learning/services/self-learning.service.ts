import { Injectable, NotFoundException } from '@nestjs/common';
import { SelfLearningRepository } from '../repositories/self-learning.repository';
import { ConfigStoreService } from '../../config-store/config-store.service';
import {
  SelfLearningContent,
  SelfLearningWatchStat,
  ForumPost,
  ForumResourceMaterial,
} from '@prisma/client';
import { CreateForumPostDto } from '../dto/create-forum-post.dto';
import { RecordWatchStatDto } from '../dto/record-watch-stat.dto';

export interface FormattedForumPost {
  id: string;
  senderId: string;
  senderName: string;
  isAnonymous: boolean;
  text: string;
  image?: string;
  time: string;
  likedBy: string[];
  tippedPoints: number;
}

const INTERACTIONS_KEY = 'selfLearningInteractions';

@Injectable()
export class SelfLearningService {
  constructor(
    private readonly selfLearningRepository: SelfLearningRepository,
    private readonly configStoreService: ConfigStoreService,
  ) {}

  // ─── Contents ─────────────────────────────────────────────────────────────

  async getAllContents(): Promise<SelfLearningContent[]> {
    return this.selfLearningRepository.findAllContents();
  }

  async createContent(body: Record<string, unknown>): Promise<SelfLearningContent> {
    return this.selfLearningRepository.createContent(body);
  }

  async deleteContent(id: string): Promise<void> {
    const contents = await this.selfLearningRepository.findAllContents();
    const exists = contents.find((c) => c.id === id);
    if (!exists) throw new NotFoundException(`Content ${id} not found`);
    await this.selfLearningRepository.deleteContent(id);
  }

  // ─── Watch Stats ──────────────────────────────────────────────────────────

  async recordWatchStat(dto: RecordWatchStatDto): Promise<SelfLearningWatchStat> {
    return this.selfLearningRepository.recordWatchStat(dto.resourceKey, dto.studentId, dto.watchDuration);
  }

  async getWatchStatsMap(): Promise<Record<string, Record<string, number>>> {
    return this.selfLearningRepository.findAllWatchStatsMap();
  }

  async batchUpdateWatchStats(statsMap: Record<string, Record<string, number>>): Promise<void> {
    await this.selfLearningRepository.batchSetWatchStats(statsMap);
  }

  // ─── Interactions (stored in MetaConfig as JSON blob) ────────────────────

  async getInteractions(): Promise<unknown> {
    return (await this.configStoreService.get(INTERACTIONS_KEY)) ?? {};
  }

  async updateInteractions(data: unknown): Promise<void> {
    await this.configStoreService.set(INTERACTIONS_KEY, data);
  }

  // ─── Forum Posts ──────────────────────────────────────────────────────────

  async getForumPosts(): Promise<FormattedForumPost[]> {
    const posts = await this.selfLearningRepository.findAllForumPosts();
    return posts.map((p) => this.formatForumPost(p));
  }

  async createForumPost(dto: CreateForumPostDto): Promise<FormattedForumPost> {
    const post = await this.selfLearningRepository.createForumPost(dto);
    return this.formatForumPost(post);
  }

  async toggleLikePost(postId: string, studentId: string): Promise<FormattedForumPost> {
    const updated = await this.selfLearningRepository.toggleLikePost(postId, studentId);
    if (!updated) throw new NotFoundException(`Forum post ${postId} not found`);
    return this.formatForumPost(updated);
  }

  // ─── Materials ────────────────────────────────────────────────────────────

  async getAllMaterials(): Promise<ForumResourceMaterial[]> {
    return this.selfLearningRepository.findAllMaterials();
  }

  async createMaterial(body: Record<string, unknown>): Promise<ForumResourceMaterial> {
    return this.selfLearningRepository.createMaterial(body);
  }

  async deleteMaterial(id: string): Promise<void> {
    const materials = await this.selfLearningRepository.findAllMaterials();
    const exists = materials.find((m) => m.id === id);
    if (!exists) throw new NotFoundException(`Material ${id} not found`);
    await this.selfLearningRepository.deleteMaterial(id);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private formatForumPost(p: ForumPost): FormattedForumPost {
    let likedByList: string[] = [];
    try { likedByList = JSON.parse(p.likedBy); } catch { likedByList = []; }
    return {
      id: p.id,
      senderId: p.senderId,
      senderName: p.senderName,
      isAnonymous: p.isAnonymous,
      text: p.text,
      image: p.image ?? undefined,
      time: p.time,
      likedBy: likedByList,
      tippedPoints: p.tippedPoints,
    };
  }
}
