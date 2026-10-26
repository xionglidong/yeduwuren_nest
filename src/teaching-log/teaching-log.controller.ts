import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, UsePipes, ValidationPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { TeachingLogService } from './teaching-log.service';
import { CreateTeachingLogDto } from './dto/create-teaching-log.dto';
import { UpdateTeachingLogDto } from './dto/update-teaching-log.dto';
import { QueryTeachingLogDto } from './dto/query-teaching-log.dto';
import { TeachingLog } from '@prisma/client';

@Controller('api/v1/teaching-logs')
export class TeachingLogController {
  constructor(private readonly teachingLogService: TeachingLogService) {}

  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async findAll(@Query() query: QueryTeachingLogDto) {
    return this.teachingLogService.findAll(
      query.page ?? 1,
      query.pageSize ?? 8,
      query.studentName,
      query.className,
      query.logDate,
    );
  }

  @Get('by-student/:name')
  async findByStudentName(@Param('name') name: string): Promise<TeachingLog[]> {
    return this.teachingLogService.findByStudentName(decodeURIComponent(name));
  }

  @Post()
  async create(@Body() dto: CreateTeachingLogDto): Promise<TeachingLog> {
    return this.teachingLogService.create(dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingLogDto,
  ): Promise<TeachingLog> {
    return this.teachingLogService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.teachingLogService.delete(id);
  }
}
