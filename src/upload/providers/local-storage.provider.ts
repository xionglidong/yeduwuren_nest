import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageService, UploadFileOptions, StoredFileInfo, ListedFileInfo } from '../interfaces/storage.interface';

@Injectable()
export class LocalStorageProvider implements IStorageService {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;

  constructor(private readonly configService: ConfigService) {
    this.baseDir = process.cwd();
  }

  async saveBase64Image(base64Data: string, subDir: string): Promise<StoredFileInfo> {
    try {
      let b64Str = base64Data;
      let ext = 'png';

      if (b64Str.startsWith('data:image')) {
        const parts = b64Str.split(',', 2);
        const header = parts[0];
        b64Str = parts[1];
        const match = header.match(/data:image\/([^;]+);/);
        if (match && match[1]) {
          ext = match[1];
        }
      }

      const imgBuffer = Buffer.from(b64Str, 'base64');
      const filename = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      const targetDir = path.join(this.baseDir, subDir);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filepath = path.join(targetDir, filename);
      await fs.promises.writeFile(filepath, imgBuffer);

      this.logger.log(`Saved base64 image: ${filepath}`);
      return {
        url: `/${subDir}/${filename}`,
        filename,
        size: imgBuffer.length,
      };
    } catch (error) {
      this.logger.error(`Failed to save base64 image: ${error instanceof Error ? error.message : error}`);
      throw new HttpException('Image upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async saveFile(options: UploadFileOptions): Promise<StoredFileInfo> {
    try {
      const targetDir = path.join(this.baseDir, options.subDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filepath = path.join(targetDir, options.filename);
      await fs.promises.writeFile(filepath, options.buffer);

      this.logger.log(`Saved file: ${filepath}`);
      return {
        url: `${options.subDir}/${options.filename}`,
        filename: options.filename,
        size: options.buffer.length,
      };
    } catch (error) {
      this.logger.error(`Failed to save file ${options.filename}: ${error instanceof Error ? error.message : error}`);
      throw new HttpException('File save failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async listFiles(subDir: string): Promise<ListedFileInfo[]> {
    try {
      const targetDir = path.join(this.baseDir, subDir);
      if (!fs.existsSync(targetDir)) {
        return [];
      }

      const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
      const result: ListedFileInfo[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') || !entry.isFile()) {
          continue;
        }
        const fullPath = path.join(targetDir, entry.name);
        const stat = await fs.promises.stat(fullPath);
        result.push({
          name: entry.name,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }

      return result.sort((a, b) => b.mtime - a.mtime);
    } catch (error) {
      this.logger.error(`Failed to list files in ${subDir}: ${error instanceof Error ? error.message : error}`);
      throw new HttpException('Failed to read file directory', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
