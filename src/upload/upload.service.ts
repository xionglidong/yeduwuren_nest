import { Injectable, Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import {
  IStorageService,
  STORAGE_SERVICE_TOKEN,
  StoredFileInfo,
  ListedFileInfo,
} from './interfaces/storage.interface';
import { UploadBase64ImageDto } from './dto/upload-base64-image.dto';

export interface ExpressMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: IStorageService,
    private readonly configService: ConfigService,
  ) {}

  async uploadImage(dto: UploadBase64ImageDto): Promise<{ url: string }> {
    const uploadDir = this.configService.get<string>('app.uploadDir', 'uploads');
    const result: StoredFileInfo = await this.storageService.saveBase64Image(dto.image, uploadDir);
    return { url: result.url };
  }

  async uploadVideo(file: ExpressMulterFile): Promise<{ url: string }> {
    if (!file || !file.buffer) {
      throw new HttpException('Video file is required', HttpStatus.BAD_REQUEST);
    }

    const maxVideoBytes = this.configService.get<number>('app.maxVideoBytes', 209715200);
    if (file.size > maxVideoBytes) {
      throw new HttpException({ error: 'file_too_large' }, HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const videoDir = this.configService.get<string>('app.videoDir', 'video');
    const originalName = path.basename(file.originalname || 'video.mp4');
    const ext = path.extname(originalName).toLowerCase().replace('.', '') || 'mp4';
    const nameRoot = path.basename(originalName, path.extname(originalName)).replace(/\s+/g, '_') || 'video';
    const safeName = `${nameRoot}_${Date.now()}.${ext}`;

    const result: StoredFileInfo = await this.storageService.saveFile({
      subDir: videoDir,
      filename: safeName,
      buffer: file.buffer,
      mimeType: file.mimetype,
    });

    return { url: result.url };
  }

  async uploadPdf(file: ExpressMulterFile): Promise<{ url: string }> {
    if (!file || !file.buffer) {
      throw new HttpException('PDF file is required', HttpStatus.BAD_REQUEST);
    }

    const maxPdfBytes = this.configService.get<number>('app.maxPdfBytes', 209715200);
    if (file.size > maxPdfBytes) {
      throw new HttpException({ error: 'file_too_large' }, HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const pdfDir = this.configService.get<string>('app.pdfDir', 'pdf');
    const originalName = path.basename(file.originalname || 'doc.pdf');
    const ext = path.extname(originalName).toLowerCase().replace('.', '') || 'pdf';
    const nameRoot = path.basename(originalName, path.extname(originalName)).replace(/\s+/g, '_') || 'pdf';
    const safeName = `${nameRoot}_${Date.now()}.${ext}`;

    const result: StoredFileInfo = await this.storageService.saveFile({
      subDir: pdfDir,
      filename: safeName,
      buffer: file.buffer,
      mimeType: file.mimetype,
    });

    return { url: result.url };
  }

  async listVideos(): Promise<ListedFileInfo[]> {
    const videoDir = this.configService.get<string>('app.videoDir', 'video');
    return this.storageService.listFiles(videoDir);
  }

  async listPdfs(): Promise<ListedFileInfo[]> {
    const pdfDir = this.configService.get<string>('app.pdfDir', 'pdf');
    return this.storageService.listFiles(pdfDir);
  }
}
