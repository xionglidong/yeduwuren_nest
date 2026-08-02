import { Controller, Get, Put, Param, Body } from '@nestjs/common';
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
}
