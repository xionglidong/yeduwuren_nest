import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';

import configuration from './config/configuration';
import { validate } from './config/env-validation';
import { DatabaseModule } from './database/database.module';
import { UploadModule } from './upload/upload.module';
import { StudentModule } from './student/student.module';
import { PaperModule } from './paper/paper.module';
import { TimerModule } from './timer/timer.module';
import { PointsModule } from './points/points.module';
import { SelfLearningModule } from './self-learning/self-learning.module';
import { ConfigStoreModule } from './config-store/config-store.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    // Only serve explicitly scoped subdirectories – NO root-level wildcard serving.
    // Root-level HTML/JS files are served by the custom Express middleware in main.ts,
    // which correctly skips /api/* paths before any file-system lookup.
    ServeStaticModule.forRoot(
      {
        rootPath: path.join(process.cwd(), 'uploads'),
        serveRoot: '/uploads',
        serveStaticOptions: { index: false },
      },
      {
        rootPath: path.join(process.cwd(), 'video'),
        serveRoot: '/video',
        serveStaticOptions: { index: false },
      },
      {
        rootPath: path.join(process.cwd(), 'pdf'),
        serveRoot: '/pdf',
        serveStaticOptions: { index: false },
      },
      {
        rootPath: path.join(process.cwd(), 'js'),
        serveRoot: '/js',
        serveStaticOptions: { index: false },
      },
    ),
    DatabaseModule,
    ConfigStoreModule,
    UploadModule,
    StudentModule,
    PaperModule,
    TimerModule,
    PointsModule,
    SelfLearningModule,
  ],
})
export class AppModule {}
