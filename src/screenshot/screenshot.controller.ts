import { Controller, Post, Body, Res, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ScreenshotService } from './screenshot.service';

@Controller('api/screenshot')
export class ScreenshotController {
  private readonly logger = new Logger(ScreenshotController.name);

  constructor(private readonly screenshotService: ScreenshotService) {}

  /**
   * POST /api/screenshot/capture
   * Body: { url, localStorageData?, waitSelector?, waitMs? }
   * Returns: PNG image binary
   */
  @Post('capture')
  async capture(
    @Body()
    body: {
      url: string;
      localStorageData?: Record<string, string>;
      waitSelector?: string;
      waitMs?: number;
    },
    @Res() res: Response,
  ): Promise<void> {
    const { url, localStorageData = {}, waitSelector, waitMs } = body;

    if (!url) {
      throw new HttpException('缺少 url 参数', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`Screenshot requested for: ${url}`);

    try {
      const buffer = await this.screenshotService.captureFullPage(url, {
        localStorageData,
        waitSelector,
        waitMs,
      });

      res.set({
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="report.png"',
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    } catch (err) {
      this.logger.error('Screenshot failed', err);
      throw new HttpException(
        `截图失败: ${(err as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
