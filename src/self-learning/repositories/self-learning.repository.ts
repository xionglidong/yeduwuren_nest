import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  SelfLearningContent,
  SelfLearningWatchStat,
  ForumPost,
  ForumResourceMaterial,
} from '@prisma/client';
import { CreateForumPostDto } from '../dto/create-forum-post.dto';

@Injectable()
export class SelfLearningRepository {
  private readonly logger = new Logger(SelfLearningRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Contents ─────────────────────────────────────────────────────────────

  async findAllContents(): Promise<SelfLearningContent[]> {
    return this.prisma.selfLearningContent.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createContent(body: Record<string, unknown>): Promise<SelfLearningContent> {
    return this.prisma.selfLearningContent.create({
      data: {
        title: String(body['title'] ?? ''),
        type: String(body['type'] ?? 'VIDEO'),
        fileUrl: String(body['fileUrl'] ?? ''),
        size: body['size'] != null ? Number(body['size']) : null,
        createTime: String(body['createTime'] ?? new Date().toLocaleString()),
      },
    });
  }

  async deleteContent(id: string): Promise<void> {
    await this.prisma.selfLearningContent.delete({ where: { id } });
  }

  // ─── Watch Stats ──────────────────────────────────────────────────────────

  async recordWatchStat(resourceKey: string, studentId: string, watchDuration: number): Promise<SelfLearningWatchStat> {
    return this.prisma.selfLearningWatchStat.upsert({
      where: { resourceKey_studentId: { resourceKey, studentId } },
      update: { watchDuration: { increment: watchDuration } },
      create: { resourceKey, studentId, watchDuration },
    });
  }

  async findAllWatchStatsMap(): Promise<Record<string, Record<string, number>>> {
    const stats = await this.prisma.selfLearningWatchStat.findMany();
    const map: Record<string, Record<string, number>> = {};
    for (const stat of stats) {
      if (!map[stat.resourceKey]) map[stat.resourceKey] = {};
      map[stat.resourceKey][stat.studentId] = stat.watchDuration;
    }
    return map;
  }

  /** Batch set watch stats from a full Map object (frontend format) */
  async batchSetWatchStats(statsMap: Record<string, Record<string, number>>): Promise<void> {
    for (const [resourceKey, students] of Object.entries(statsMap)) {
      for (const [studentId, watchDuration] of Object.entries(students)) {
        await this.prisma.selfLearningWatchStat.upsert({
          where: { resourceKey_studentId: { resourceKey, studentId } },
          update: { watchDuration },
          create: { resourceKey, studentId, watchDuration },
        });
      }
    }
  }

  // ─── Forum Posts ──────────────────────────────────────────────────────────

  async findAllForumPosts(): Promise<ForumPost[]> {
    return this.prisma.forumPost.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createForumPost(dto: CreateForumPostDto): Promise<ForumPost> {
    return this.prisma.forumPost.create({
      data: {
        senderId: dto.senderId,
        senderName: dto.senderName,
        isAnonymous: dto.isAnonymous ?? false,
        text: dto.text,
        image: dto.image ?? null,
        time: new Date().toLocaleString(),
        likedBy: '[]',
      },
    });
  }

  async toggleLikePost(postId: string, studentId: string): Promise<ForumPost | null> {
    const post = await this.prisma.forumPost.findUnique({ where: { id: postId } });
    if (!post) return null;

    let likedList: string[] = [];
    try { likedList = JSON.parse(post.likedBy); } catch { likedList = []; }

    const index = likedList.indexOf(studentId);
    if (index > -1) { likedList.splice(index, 1); } else { likedList.push(studentId); }

    return this.prisma.forumPost.update({
      where: { id: postId },
      data: { likedBy: JSON.stringify(likedList) },
    });
  }

  // ─── Materials ────────────────────────────────────────────────────────────

  async findAllMaterials(): Promise<ForumResourceMaterial[]> {
    return this.prisma.forumResourceMaterial.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createMaterial(body: Record<string, unknown>): Promise<ForumResourceMaterial> {
    return this.prisma.forumResourceMaterial.create({
      data: {
        title: String(body['title'] ?? ''),
        file: String(body['file'] ?? ''),
        createTime: String(body['createTime'] ?? new Date().toLocaleString()),
      },
    });
  }

  async deleteMaterial(id: string): Promise<void> {
    await this.prisma.forumResourceMaterial.delete({ where: { id } });
  }
}
