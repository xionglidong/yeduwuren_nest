import { IsString, IsNotEmpty } from 'class-validator';

export class ExchangePrizeDto {
  @IsString()
  @IsNotEmpty({ message: 'studentId is required' })
  studentId!: string;

  @IsString()
  @IsNotEmpty({ message: 'prizeId is required' })
  prizeId!: string;
}
