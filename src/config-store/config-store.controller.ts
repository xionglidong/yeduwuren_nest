import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { ConfigStoreService } from './config-store.service';

@Controller('api/v1/config')
export class ConfigStoreController {
  constructor(private readonly configStoreService: ConfigStoreService) {}

  @Get(':key')
  async get(@Param('key') key: string): Promise<unknown> {
    return this.configStoreService.get(key);
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
