import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentRepository } from './student.repository';
import { PrismaService } from '../database/prisma.service';
import { Student } from '@prisma/client';
import { UpdateStudentPointsDto } from './dto/update-student-points.dto';
import { PredictionService } from '../prediction/prediction.service';

@Injectable()
export class StudentService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly prisma: PrismaService,
    private readonly predictionService: PredictionService,
  ) {}
  
  async getStudentById(id: string){
    const student = await this.studentRepository.getStudentInfo(id);
    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found`);
    }
    return student;
  }

  async deleteStudent(id: string): Promise<void> {
    const student = await this.studentRepository.findById(id);
    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found`);
    }
    await this.studentRepository.deleteStudent(id);
  }

  async getAllStudents(): Promise<Student[]> {
    return this.studentRepository.findAll();
  }

  async getAllStudentsMap(): Promise<Record<string, Omit<Partial<Student>, 'schoolScores'> & { schoolScores: unknown[] }>> {
    return this.studentRepository.findAllAsMap();
  }


  async upsertStudentPoint(dto: UpdateStudentPointsDto): Promise<Student> {
    return this.studentRepository.upsertStudentPoint(dto);
  }

  async recalculateLearningPower() {
    const students = await this.prisma.student.findMany();
    for (const student of students) {
      const prediction = await this.predictionService.predictPhaseTarget(student.id);
      const predictedScore = prediction.configured && prediction.predictedScore !== null
        ? prediction.predictedScore
        : 0;
      const confidenceRate = prediction.configured
        ? Math.min(100, Math.max(0, prediction.confidence)) / 100
        : 0;
      const learningPower = Math.round(predictedScore * confidenceRate * 10) / 10;

      await this.studentRepository.updateLearningPower(
        student.id,
        learningPower,
      );
    }

    // Return updated student map
    const updatedMap = await this.studentRepository.findAllAsMap();
    return { students: updatedMap };
  }

  /**
   * 按指定字段降序返回前 N 名学生
   * @param field  排序字段（已由 DTO 白名单限制）
   * @param limit  返回数量
   */
  async getTopStudents(field: string, limit: number): Promise<Student[]> {
    return this.studentRepository.findTopByField(field, limit);
  }

  /**
   * 校验姓名与学号是否匹配，用于学生登录验证
   * @param id    学号
   * @param name  前端传入的姓名
   */
  async verifyStudent(id: string, name: string) {
    const student = await this.studentRepository.getStudentInfo(id);
    if (!student || student.name !== name) {
      return {error:'登录失败：姓名与学号不匹配，请检查输入'}
    }
    return student;
  }
}
