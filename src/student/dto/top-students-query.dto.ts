import { IsIn, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Student 表中允许作为排序依据的字段白名单 */
export const SORTABLE_STUDENT_FIELDS = [
  'points',
  'learningPower',
  'cohort',
  'createdAt',
  'lastUpdate',
] as const;

export type SortableStudentField = (typeof SORTABLE_STUDENT_FIELDS)[number];

export class TopStudentsQueryDto {
  /** 按哪个字段降序排列 */
  @IsString()
  @IsIn(SORTABLE_STUDENT_FIELDS, {
    message: `field 必须是以下之一: ${SORTABLE_STUDENT_FIELDS.join(', ')}`,
  })
  field: SortableStudentField;

  /** 返回前 N 名学生（最少 1，最多 200） */
  @Type(() => Number)
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1, { message: 'limit 最小为 1' })
  limit: number;
}
