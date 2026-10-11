import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateTeachingLogDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  studentName?: string;

  @IsString()
  @IsNotEmpty({ message: '上课日期不能为空' })
  logDate!: string;

  @IsString()
  @IsNotEmpty({ message: '开始时间不能为空' })
  startTime!: string;

  @IsString()
  @IsNotEmpty({ message: '结束时间不能为空' })
  endTime!: string;

  @IsString()
  @IsOptional()
  paperId?: string;

  @IsString()
  @IsNotEmpty({ message: '授课内容不能为空' })
  content!: string;
}
