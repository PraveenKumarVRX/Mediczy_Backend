import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentStatusDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book an appointment' })
  async book(
    @CurrentUser('id')              userId: number,
    @CurrentUser('organizationId') orgId:   number,
    @CurrentUser('organizationType') orgType: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.book(userId, orgId, orgType, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current patient appointments (paginated)' })
  async myAppointments(
    @CurrentUser('id')                                     userId: number,
    @Query('page', new ParseIntPipe({ optional: true }))   page = 1,
    @Query('limit', new ParseIntPipe({ optional: true }))  limit = 10,
  ) {
    return this.appointmentsService.findByPatient(userId, page, Math.min(limit, 50));
  }

  @Get('doctor/:doctorId')
  @Roles('doctor','hospital_admin','clinic_admin','system_admin','nurse')
  @ApiOperation({ summary: 'Get doctor schedule for a date range' })
  @ApiQuery({ name: 'from', required: true, example: '2026-06-01' })
  @ApiQuery({ name: 'to',   required: true, example: '2026-06-07' })
  async doctorSchedule(
    @Param('doctorId', ParseIntPipe) doctorId: number,
    @Query('from') from: string,
    @Query('to')   to:   string,
  ) {
    return this.appointmentsService.findByDoctor(doctorId, new Date(from), new Date(to));
  }

  @Get('stats/day')
  @Roles('hospital_admin','clinic_admin','system_admin')
  @ApiOperation({ summary: 'Get appointment stats for a day' })
  @ApiQuery({ name: 'date', required: false, example: '2026-06-01' })
  async dayStats(
    @CurrentUser('organizationId') orgId: number,
    @Query('date') dateStr?: string,
  ) {
    const date = dateStr ? new Date(dateStr) : new Date();
    return this.appointmentsService.getDayStats(orgId, date);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update appointment status (confirm/complete/cancel)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(id, dto);
  }
}
