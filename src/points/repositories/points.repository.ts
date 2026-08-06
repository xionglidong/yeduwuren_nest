import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangePrize, ExchangeRecord } from '@prisma/client';

@Injectable()
export class PointsRepository {
  private readonly logger = new Logger(PointsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Prizes ───────────────────────────────────────────────────────────────

  async findAllPrizes(): Promise<ExchangePrize[]> {
    return this.prisma.exchangePrize.findMany({
      where: { isAvailable: true },
      orderBy: { points: 'asc' },
    });
  }

  async findPrizeById(id: string): Promise<ExchangePrize | null> {
    return this.prisma.exchangePrize.findUnique({ where: { id } });
  }

  async createPrize(body: Record<string, unknown>): Promise<ExchangePrize> {
    return this.prisma.exchangePrize.create({
      data: {
        name: String(body['name'] ?? ''),
        points: Number(body['points'] ?? 0),
        description: body['description'] ? String(body['description']) : null,
        icon: body['icon'] ? String(body['icon']) : null,
        iconColor: body['iconColor'] ? String(body['iconColor']) : null,
        bgColor: body['bgColor'] ? String(body['bgColor']) : null,
      },
    });
  }

  async deletePrize(id: string): Promise<void> {
    await this.prisma.exchangePrize.delete({ where: { id } });
  }

  // ─── Exchange Records ─────────────────────────────────────────────────────

  async createExchangeRecord(
    studentId: string,
    studentName: string,
    prizeName: string,
    points: number,
  ): Promise<ExchangeRecord> {
    return this.prisma.exchangeRecord.create({
      data: { studentId, studentName, prizeName, points, time: new Date().toLocaleString() },
    });
  }

  async findAllExchangeRecords(): Promise<ExchangeRecord[]> {
    return this.prisma.exchangeRecord.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findExchangeRecordsByStudent(studentId: string): Promise<ExchangeRecord[]> {
    return this.prisma.exchangeRecord.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
