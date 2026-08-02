import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateForumPostDto {
  @IsString()
  @IsNotEmpty({ message: 'senderId is required' })
  senderId!: string;

  @IsString()
  @IsNotEmpty({ message: 'senderName is required' })
  senderName!: string;

  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;

  @IsString()
  @IsNotEmpty({ message: 'text content is required' })
  text!: string;

  @IsString()
  @IsOptional()
  image?: string;
}
