import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class UpdateStudentPointsDto {
  @IsString()
  @IsNotEmpty({ message: 'Student ID is required' })
  id!: string;

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

  @IsString()
  @IsOptional()
  lastUpdate?: string;
}
