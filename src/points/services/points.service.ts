import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PointsRepository } from '../repositories/points.repository';
import { StudentRepository } from '../../student/student.repository';
import { ExchangePrize, ExchangeRecord } from '@prisma/client';
import { ExchangePrizeDto } from '../dto/exchange-prize.dto';

@Injectable()
export class PointsService {
  constructor(
    private readonly pointsRepository: PointsRepository,
    private readonly studentRepository: StudentRepository,
  ) {}

  async getAllPrizes(): Promise<ExchangePrize[]> {
    return this.pointsRepository.findAllPrizes();
  }

  async createPrize(body: Record<string, unknown>): Promise<ExchangePrize> {
    return this.pointsRepository.createPrize(body);
  }

  async deletePrize(id: string): Promise<void> {
    const prize = await this.pointsRepository.findPrizeById(id);
    if (!prize) throw new NotFoundException(`Prize ${id} not found`);
    await this.pointsRepository.deletePrize(id);
  }

  async getAllExchangeRecords(): Promise<ExchangeRecord[]> {
    return this.pointsRepository.findAllExchangeRecords();
  }

  async getExchangeRecordsByStudent(studentId: string): Promise<ExchangeRecord[]> {
    return this.pointsRepository.findExchangeRecordsByStudent(studentId);
  }

  async exchangePrize(dto: ExchangePrizeDto): Promise<ExchangeRecord> {
    const student = await this.studentRepository.findById(dto.studentId);
    if (!student) throw new NotFoundException(`Student ${dto.studentId} not found`);

    const prize = await this.pointsRepository.findPrizeById(dto.prizeId);
    if (!prize) throw new NotFoundException(`Prize ${dto.prizeId} not found`);

    if (student.points < prize.points) {
      throw new BadRequestException(`Insufficient student points. Required: ${prize.points}, Current: ${student.points}`);
    }

    await this.studentRepository.upsertStudentPoint({
      id: student.id,
      points: student.points - prize.points,
    });

    return this.pointsRepository.createExchangeRecord(
      student.id, student.name, prize.name, prize.points,
    );
  }
}
