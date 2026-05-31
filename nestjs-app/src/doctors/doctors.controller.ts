import {
  Controller, Get, Post, Patch, Param, Query, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { SearchDoctorsDto, CreateScheduleDto, BookSlotDto } from './dto/doctor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId } from '../common/decorators/org-id.decorator';

@ApiTags('Doctors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search doctors by specialization, city, availability' })
  async search(@Query() dto: SearchDoctorsDto, @OrgId() orgId: number) {
    return this.doctorsService.search(dto, orgId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get doctor profile' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.doctorsService.findById(id);
  }

  @Public()
  @Get(':id/slots')
  @ApiOperation({ summary: 'Get available appointment slots for a date' })
  @ApiQuery({ name: 'date', required: true, example: '2026-06-15' })
  async getSlots(
    @Param('id', ParseIntPipe) doctorId: number,
    @Query('date') date: string,
  ) {
    return this.doctorsService.getAvailableSlots(doctorId, date);
  }

  @Post(':id/slots/book')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomically book a doctor slot' })
  async bookSlot(
    @Param('id', ParseIntPipe) doctorId: number,
    @Body() dto: BookSlotDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.doctorsService.bookSlot(doctorId, dto.slotId, dto.sessionId || String(userId));
  }

  @Post(':id/schedules')
  @Roles('doctor','hospital_admin','clinic_admin','system_admin')
  @ApiOperation({ summary: 'Add a recurring weekly schedule for a doctor' })
  async createSchedule(
    @Param('id', ParseIntPipe) doctorId: number,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.doctorsService.createSchedule(doctorId, dto);
  }

  @Post(':id/slots/generate')
  @Roles('doctor','hospital_admin','clinic_admin','system_admin')
  @ApiOperation({ summary: 'Generate concrete slots from weekly schedules for a date range' })
  async generateSlots(
    @Param('id', ParseIntPipe) doctorId: number,
    @Query('from') from: string,
    @Query('to')   to:   string,
  ) {
    return this.doctorsService.generateSlots(doctorId, from, to);
  }

  @Patch(':id/online-status')
  @Roles('doctor','system_admin')
  @ApiOperation({ summary: 'Set doctor online/offline status' })
  async setOnlineStatus(
    @Param('id', ParseIntPipe) doctorId: number,
    @Body('isOnline') isOnline: boolean,
  ) {
    return this.doctorsService.setOnlineStatus(doctorId, isOnline);
  }
}
