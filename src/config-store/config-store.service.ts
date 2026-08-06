import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ConfigStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<unknown> {
    const row = await this.prisma.metaConfig.findUnique({ where: { key } });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    await this.prisma.metaConfig.upsert({
      where: { key },
      create: { key, value: valueStr },
      update: { value: valueStr },
    });
  }
}
