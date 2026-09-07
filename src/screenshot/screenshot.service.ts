import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';

export interface CaptureOptions {
  /** 需要预先注入到新页面 localStorage 的数据（键值对） */
  localStorageData?: Record<string, string>;
  /** 额外等待此 CSS 选择器出现后再截图（用于图表等异步渲染元素） */
  waitSelector?: string;
  /** 等待选择器出现后额外再等待的毫秒数，默认 500 */
  waitMs?: number;
}

@Injectable()
export class ScreenshotService {
  private readonly logger = new Logger(ScreenshotService.name);
  private browser: Browser | null = null;

  async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  /**
   * 截取指定 URL 的页面全图，返回 PNG Buffer
   * @param url 要截图的页面地址
   * @param options 截图选项
   */
  async captureFullPage(url: string, options: CaptureOptions = {}): Promise<Buffer> {
    const { localStorageData = {}, waitSelector, waitMs = 500 } = options;

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2, // 高清截图
    });
    const page = await context.newPage();

    try {
      this.logger.log(`Navigating to: ${url}`);

      // ★ 若需要注入 localStorage：先打开同源根页，写入数据，再跳目标页
      if (Object.keys(localStorageData).length > 0) {
        const urlObj = new URL(url);
        const origin = urlObj.origin;
        await page.goto(origin, { waitUntil: 'commit', timeout: 10000 }).catch(() => {});
        await page.evaluate((data) => {
          for (const [k, v] of Object.entries(data)) {
            if (v !== null && v !== undefined) {
              localStorage.setItem(k, v as string);
            }
          }
        }, localStorageData);
      }

      // 导航到目标页
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // 等待指定选择器出现（自定义，如图表 canvas、学生姓名等）
      const selector = waitSelector || '#studentName';
      await page.waitForSelector(selector, { timeout: 15000 }).catch(() => {
        this.logger.warn(`Selector "${selector}" not found, proceeding anyway`);
      });

      // 额外等待（确保 Chart.js 等异步渲染、字体加载完毕）
      await page.waitForTimeout(waitMs);

      // 隐藏右上角操作按钮（.no-print 区域）并将 body 背景改为白色（防止深色背景污染截图）
      await page.evaluate(() => {
        document.querySelectorAll('.no-print').forEach((el) => {
          (el as HTMLElement).style.display = 'none';
        });
        // report.html 的 body 背景是深灰色，截图改为白色
        document.body.style.background = '#ffffff';
        document.body.style.padding = '0';
      });

      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: 'png',
      });

      return screenshotBuffer;
    } finally {
      await context.close();
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
