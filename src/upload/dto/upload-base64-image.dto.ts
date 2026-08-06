import { IsNotEmpty, IsString } from 'class-validator';

export class UploadBase64ImageDto {
  @IsString()
  @IsNotEmpty({ message: 'Base64 image string is required' })
  image!: string;
}
