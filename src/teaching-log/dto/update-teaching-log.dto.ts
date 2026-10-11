import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateTeachingLogDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  studentName?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: '上课日期不能为空' })
  logDate?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: '开始时间不能为空' })
  startTime?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: '结束时间不能为空' })
  endTime?: string;

  @IsString()
  @IsOptional()
  paperId?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: '授课内容不能为空' })
  content?: string;
}
