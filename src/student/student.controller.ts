import { Controller, Get, Put, Post, Delete, Param, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { StudentService } from './student.service';
import { Student } from '@prisma/client';
import { UpdateStudentPointsDto } from './dto/update-student-points.dto';

@Controller('api/v1/students')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get()
  async getAllStudents(): Promise<Student[]> {
    return this.studentService.getAllStudents();
  }

  /** Returns { [studentId]: { name, points, grade, ... } } map for frontend compatibility */
  @Get('map')
  async getStudentsMap(): Promise<Record<string, Partial<Student>>> {
    return this.studentService.getAllStudentsMap();
  }

  @Post('recalculate-learning-power')
  async recalculateLearningPower(
    @Body() body: { cPoints: number; cAccuracy: number; cDuration: number; cQuestions: number },
  ) {
    const { cPoints, cAccuracy, cDuration, cQuestions } = body;
    if (
      typeof cPoints !== 'number' || isNaN(cPoints) || cPoints <= 0 ||
      typeof cAccuracy !== 'number' || isNaN(cAccuracy) || cAccuracy <= 0 ||
      typeof cDuration !== 'number' || isNaN(cDuration) || cDuration <= 0 ||
      typeof cQuestions !== 'number' || isNaN(cQuestions) || cQuestions <= 0
    ) {
      throw new BadRequestException('All parameters (cPoints, cAccuracy, cDuration, cQuestions) must be numbers greater than 0');
    }
    return this.studentService.recalculateLearningPower(body);
  }

  @Put(':id/points')
  async updateStudentPoints(
    @Param('id') id: string,
    @Body() dto: UpdateStudentPointsDto,
  ): Promise<Student> {
    return this.studentService.upsertStudentPoint({ ...dto, id });
  }

  @Get(':id')
  async getStudentById(@Param('id') id: string): Promise<Student> {
    return this.studentService.getStudentById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStudent(@Param('id') id: string): Promise<void> {
    return this.studentService.deleteStudent(id);
  }
}
