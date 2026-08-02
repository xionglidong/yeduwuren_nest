import {
  Controller,
  Post,
  Get,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService, ExpressMulterFile } from './upload.service';
import { UploadBase64ImageDto } from './dto/upload-base64-image.dto';
import { ListedFileInfo } from './interfaces/storage.interface';

@Controller('api/v1/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  async uploadBase64Image(@Body() dto: UploadBase64ImageDto): Promise<{ url: string }> {
    return this.uploadService.uploadImage(dto);
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('video'))
  async uploadVideo(@UploadedFile() file: ExpressMulterFile): Promise<{ url: string }> {
    return this.uploadService.uploadVideo(file);
  }

  @Post('pdf')
  @UseInterceptors(FileInterceptor('pdf'))
  async uploadPdf(@UploadedFile() file: ExpressMulterFile): Promise<{ url: string }> {
    return this.uploadService.uploadPdf(file);
  }

  @Get('videos')
  async listVideos(): Promise<ListedFileInfo[]> {
    return this.uploadService.listVideos();
  }

  @Get('pdfs')
  async listPdfs(): Promise<ListedFileInfo[]> {
    return this.uploadService.listPdfs();
  }
}

@Controller('api')
export class LegacyUploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload')
  async uploadBase64ImageLegacy(@Body() dto: UploadBase64ImageDto): Promise<{ url: string }> {
    return this.uploadService.uploadImage(dto);
  }

  @Post('upload_video')
  @UseInterceptors(FileInterceptor('video'))
  async uploadVideoLegacy(@UploadedFile() file: ExpressMulterFile): Promise<{ url: string }> {
    return this.uploadService.uploadVideo(file);
  }

  @Post('upload_pdf')
  @UseInterceptors(FileInterceptor('pdf'))
  async uploadPdfLegacy(@UploadedFile() file: ExpressMulterFile): Promise<{ url: string }> {
    return this.uploadService.uploadPdf(file);
  }

  @Get('videos')
  async listVideosLegacy(): Promise<ListedFileInfo[]> {
    return this.uploadService.listVideos();
  }

  @Get('pdfs')
  async listPdfsLegacy(): Promise<ListedFileInfo[]> {
    return this.uploadService.listPdfs();
  }
}
