import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 8002;

  @IsString()
  @IsOptional()
  DATABASE_URL: string = 'file:./database.db';

  @IsString()
  @IsOptional()
  UPLOAD_DIR: string = 'uploads';

  @IsString()
  @IsOptional()
  VIDEO_DIR: string = 'video';

  @IsString()
  @IsOptional()
  PDF_DIR: string = 'pdf';

  @IsNumber()
  @IsOptional()
  MAX_VIDEO_BYTES: number = 209715200;

  @IsNumber()
  @IsOptional()
  MAX_PDF_BYTES: number = 209715200;

  @IsString()
  @IsOptional()
  JWT_SECRET: string = 'super-secret-key-change-in-production';
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation error: ${errors.toString()}`);
  }
  return validatedConfig;
}
