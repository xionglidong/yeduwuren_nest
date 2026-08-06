import { IsString, IsNotEmpty } from 'class-validator';

export class UpsertTimerRecordDto {
  @IsString()
  @IsNotEmpty({ message: 'studentId is required' })
  studentId!: string;

  @IsString()
  @IsNotEmpty({ message: 'paperId is required' })
  paperId!: string;

  @IsNotEmpty({ message: 'record is required' })
  record!: unknown;
}
