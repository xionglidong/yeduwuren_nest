import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to SQLite database via Prisma...');
    await this.$connect();
    this.logger.log('SQLite database connected successfully.');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from SQLite database...');
    await this.$disconnect();
  }
}
