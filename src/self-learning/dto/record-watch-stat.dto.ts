import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class RecordWatchStatDto {
  @IsString()
  @IsNotEmpty({ message: 'resourceKey is required' })
  resourceKey!: string;

  @IsString()
  @IsNotEmpty({ message: 'studentId is required' })
  studentId!: string;

  @IsNumber()
  @IsNotEmpty({ message: 'watchDuration is required' })
  watchDuration!: number;
}
