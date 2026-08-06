export const STORAGE_SERVICE_TOKEN = Symbol('IStorageService');

export interface UploadFileOptions {
  subDir: string;
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

export interface StoredFileInfo {
  url: string;
  filename: string;
  size: number;
}

export interface ListedFileInfo {
  name: string;
  size: number;
  mtime: number;
}

export interface IStorageService {
  saveBase64Image(base64Data: string, subDir: string): Promise<StoredFileInfo>;
  saveFile(options: UploadFileOptions): Promise<StoredFileInfo>;
  listFiles(subDir: string): Promise<ListedFileInfo[]>;
}
