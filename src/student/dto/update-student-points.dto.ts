import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class UpdateStudentPointsDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  grade?: string;

  @IsNumber()
  @IsOptional()
  points?: number;

  @IsNumber()
  @IsOptional()
  learningPower?: number;

  @IsNumber()
  @IsOptional()
  cohort?: number;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;

  @IsString()
  @IsOptional()
  lastUpdate?: string;
}
