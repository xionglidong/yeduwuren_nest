import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentRepository } from './student.repository';
import { PrismaService } from '../database/prisma.service';
import { Student } from '@prisma/client';
import { UpdateStudentPointsDto } from './dto/update-student-points.dto';

interface LearningPowerFormula {
  cPoints: number;
  cAccuracy: number;
  cDuration: number;
  cQuestions: number;
}

@Injectable()
export class StudentService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getStudentById(id: string): Promise<Student> {
    const student = await this.studentRepository.findById(id);
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

  async getAllStudentsMap(): Promise<Record<string, Partial<Student>>> {
    return this.studentRepository.findAllAsMap();
  }

  async upsertStudentPoint(dto: UpdateStudentPointsDto): Promise<Student> {
    return this.studentRepository.upsertStudentPoint(dto);
  }

  async recalculateLearningPower(formula: {
    cPoints: number;
    cAccuracy: number;
    cDuration: number;
    cQuestions: number;
  }) {
    const {
      cPoints = 500,
      cAccuracy = 2,
      cDuration = 10,
      cQuestions = 200,
    } = formula;

    // Fetch all data
    const students = await this.prisma.student.findMany();
    const papers = await this.prisma.paper.findMany();
    const submissions = await this.prisma.studentAnswer.findMany();

    // Build paper lookup: paperId -> { typeWeight, questionCount, fillInBlankCount }
    const paperMap = new Map<
      string,
      { typeWeight: number; questionCount: number; fillInBlankCount: number }
    >();
    for (const paper of papers) {
      let parsedOptions: any = {};
      if (paper.options) {
        try {
          parsedOptions = JSON.parse(paper.options);
        } catch {
          // ignore parse errors
        }
      }
      const paperType: string = parsedOptions.type || 'test';
      let typeWeight = 0;
      if (paperType === 'test' || paperType === 'custom') {
        typeWeight = 0.7;
      } else if (paperType === 'homework') {
        typeWeight = 0.3;
      }
      const fillInBlankCount: number = parsedOptions.fillInBlankCount || 0;
      paperMap.set(paper.id, {
        typeWeight,
        questionCount: paper.questionCount,
        fillInBlankCount,
      });
    }

    // Group submissions by studentId
    const submissionsByStudent = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const list = submissionsByStudent.get(sub.studentId);
      if (list) {
        list.push(sub);
      } else {
        submissionsByStudent.set(sub.studentId, [sub]);
      }
    }

    // Calculate and update each student
    for (const student of students) {
      const subs = submissionsByStudent.get(student.id) || [];

      let weightedScoreSum = 0;
      let weightedTotalPointsSum = 0;
      let weightedDurationSecondsSum = 0;
      let weightedQuestionsSum = 0;

      for (const sub of subs) {
        const paperInfo = paperMap.get(sub.paperId);
        if (!paperInfo || paperInfo.typeWeight === 0) {
          continue;
        }
        const tw = paperInfo.typeWeight;

        weightedScoreSum += sub.score * tw;
        weightedTotalPointsSum += sub.totalPoints * tw;
        weightedDurationSecondsSum += (sub.timeElapsed || 0) * tw;
        weightedQuestionsSum +=
          (paperInfo.questionCount + paperInfo.fillInBlankCount) * tw;
      }

      const accuracyPercent =
        weightedTotalPointsSum > 0
          ? (weightedScoreSum / weightedTotalPointsSum) * 100
          : 0;
      const durationHours = weightedDurationSecondsSum / 3600;
      const questions = weightedQuestionsSum;
      const points = student.points;

      const rawPower =
        points / cPoints +
        accuracyPercent / cAccuracy +
        durationHours / cDuration +
        questions / cQuestions;

      const learningPower =
        Math.round(Math.min(100, Math.max(0, rawPower)) * 10) / 10;

      await this.studentRepository.updateLearningPower(
        student.id,
        learningPower,
      );
    }

    // Return updated student map
    const updatedMap = await this.studentRepository.findAllAsMap();
    return { students: updatedMap };
  }
}
