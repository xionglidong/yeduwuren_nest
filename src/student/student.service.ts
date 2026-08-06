import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentRepository } from './student.repository';
import { Student } from '@prisma/client';
import { UpdateStudentPointsDto } from './dto/update-student-points.dto';

@Injectable()
export class StudentService {
  constructor(private readonly studentRepository: StudentRepository) {}

  async getStudentById(id: string): Promise<Student> {
    const student = await this.studentRepository.findById(id);
    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found`);
    }
    return student;
  }

  async getAllStudents(): Promise<Student[]> {
    return this.studentRepository.findAll();
  }

  async getAllStudentsMap(): Promise<Record<string, Partial<Student>>> {
    return this.studentRepository.findAllAsMap();
  }

  async upsertStudentPoint(dto: UpdateStudentPointsDto): Promise<Student> {
    return this.studentRepository.upsertStudentPoint(dto);
  }
}
