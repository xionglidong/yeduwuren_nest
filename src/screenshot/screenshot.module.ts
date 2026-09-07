import { Module } from '@nestjs/common';
import { ScreenshotController } from './screenshot.controller';
import { ScreenshotService } from './screenshot.service';

@Module({
  controllers: [ScreenshotController],
  providers: [ScreenshotService],
})
export class ScreenshotModule {}
