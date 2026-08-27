import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { ConfigStoreService } from './config-store.service';

@Controller('api/v1/config')
export class ConfigStoreController {
  constructor(private readonly configStoreService: ConfigStoreService) {}

  @Get(':key')
  async get(@Param('key') key: string): Promise<unknown> {
    const value = await this.configStoreService.get(key);
    if (key === 'currentSchoolYear' && typeof value === 'string' && value) {
      // 获取学年后同步更新每个学生的 cohort、grade、lastUpdate
      await this.configStoreService.syncStudentGradesForSchoolYear(value);
    }
    return value;
  }

  @Put(':key')
  async set(
    @Param('key') key: string,
    @Body('value') value: unknown,
  ): Promise<{ status: string }> {
    await this.configStoreService.set(key, value);
    return { status: 'success' };
  }
}
