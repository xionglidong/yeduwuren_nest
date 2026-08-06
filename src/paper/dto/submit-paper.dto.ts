import { IsString, IsNotEmpty, IsArray, IsOptional, IsNumber } from 'class-validator';

export class SubmitPaperDto {
  @IsString()
  @IsNotEmpty({ message: 'paperId is required' })
  paperId!: string;

  @IsString()
  @IsNotEmpty({ message: 'studentId is required' })
  studentId!: string;

  @IsString()
  @IsNotEmpty({ message: 'studentName is required' })
  studentName!: string;

  @IsArray({ message: 'answers must be an array' })
  answers!: string[];

  @IsNumber()
  @IsOptional()
  score?: number;

  @IsNumber()
  @IsOptional()
  totalPoints?: number;

  @IsString()
  @IsOptional()
  submitTime?: string;

  @IsNumber()
  @IsOptional()
  timeElapsed?: number;

  @IsOptional()
  fillInBlankDetails?: unknown;

  @IsOptional()
  fillInBlankStudentImage?: unknown;

  @IsOptional()
  fillInBlankScore?: unknown;

  @IsOptional()
  draftImages?: unknown;

  @IsOptional()
  correctionImages?: unknown;

  @IsOptional()
  correctionTime?: unknown;

  @IsOptional()
  recommendedTime?: unknown;

  @IsOptional()
  interimEvents?: unknown;

  @IsOptional()
  actualTimeElapsed?: unknown;

  @IsOptional()
  totalPauseDuration?: unknown;

  @IsOptional()
  pauseCount?: unknown;

  @IsOptional()
  pauseIntervals?: unknown;
}
