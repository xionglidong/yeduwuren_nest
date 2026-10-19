import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * The complete, user-editable paper payload used by the admin editor.
 * Category/archive metadata is intentionally excluded so editing content cannot
 * accidentally move or restore a paper.
 */
export class EditPaperDto {
  @IsIn(['test', 'homework', 'correction', 'custom', 'comprehensive'])
  type!: string;

  @IsIn(['grade1', 'grade2', 'grade3'])
  grade!: string;

  @IsString()
  @IsNotEmpty({ message: '套卷名称不能为空' })
  name!: string;

  @IsString()
  deadline!: string;

  @IsInt()
  @Min(0)
  @Max(50)
  questionCount!: number;

  @IsNumber()
  @Min(0)
  @Max(20)
  singlePoints!: number;

  @IsInt()
  @Min(0)
  @Max(20)
  fillInBlankCount!: number;

  @IsArray()
  @ArrayMaxSize(50)
  answers!: unknown[];

  @IsArray()
  @ArrayMaxSize(50)
  questionTypes!: unknown[];

  @IsArray()
  @ArrayMaxSize(50)
  videos!: unknown[];

  @IsArray()
  @ArrayMaxSize(20)
  fillInBlankConfig!: unknown[];

  @IsArray()
  @ArrayMaxSize(20)
  fbPointsArray!: unknown[];

  @IsArray()
  @ArrayMaxSize(20)
  fillBlankVideos!: unknown[];

  @IsArray()
  fillInBlankAnswerImage!: unknown[];

  @IsBoolean()
  allowRedo!: boolean;

  @IsArray()
  targetStudentIds!: unknown[];

  @IsString()
  pdfFile!: string;

  @IsNumber()
  @Min(0)
  totalPoints!: number;

  // Kept optional for older papers whose editor may still send this fallback.
  @IsOptional()
  @IsNumber()
  @Min(0)
  fillInBlankPoints?: number;
}
