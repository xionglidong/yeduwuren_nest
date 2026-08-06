export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  uploadDir: string;
  videoDir: string;
  pdfDir: string;
  maxVideoBytes: number;
  maxPdfBytes: number;
  jwtSecret: string;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT || '8002', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || 'file:./database.db',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    videoDir: process.env.VIDEO_DIR || 'video',
    pdfDir: process.env.PDF_DIR || 'pdf',
    maxVideoBytes: parseInt(process.env.MAX_VIDEO_BYTES || '209715200', 10), // 200MB default
    maxPdfBytes: parseInt(process.env.MAX_PDF_BYTES || '209715200', 10), // 200MB default
    jwtSecret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
  },
});
