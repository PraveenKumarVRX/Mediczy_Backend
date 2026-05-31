import {
  Controller, Get, Post, Param, Body, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsNumber, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EhrService } from './ehr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId } from '../common/decorators/org-id.decorator';

class CreatePrescriptionDto {
  @ApiProperty() @IsInt()    patientId:    number;
  @ApiProperty() @IsString() diagnosis:    string;
  @ApiProperty() @IsArray()  medications:  any[];
  @ApiProperty({ required: false }) @IsOptional() @IsInt()    appointmentId?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?:         string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() followUpDate?:  string;
}

class RecordVitalsDto {
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() bloodPressureSystolic?:  number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() bloodPressureDiastolic?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() heartRate?:              number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() temperature?:            number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() oxygenSaturation?:       number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() respiratoryRate?:        number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() weight?:                 number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() height?:                 number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() bloodGlucose?:           number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?:                  string;
}

@ApiTags('EHR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/ehr')
export class EhrController {
  constructor(private readonly service: EhrService) {}

  @Get('patients/:id/summary')
  @ApiOperation({ summary: 'Get patient clinical summary (allergies, meds, conditions, vitals)' })
  async getPatientSummary(
    @Param('id', ParseIntPipe) patientId: number,
    @CurrentUser('id') requesterId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getPatientSummary(patientId, requesterId, role);
  }

  @Post('prescriptions')
  @HttpCode(HttpStatus.CREATED)
  @Roles('doctor','hospital_admin','clinic_admin')
  @ApiOperation({ summary: 'Create a prescription' })
  async createPrescription(
    @CurrentUser('id') doctorId: number,
    @OrgId() orgId: number,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.service.createPrescription(doctorId, orgId, dto);
  }

  @Get('patients/:id/prescriptions')
  @ApiOperation({ summary: 'Get patient prescriptions' })
  async getPatientPrescriptions(
    @Param('id', ParseIntPipe) patientId: number,
    @CurrentUser('id') requesterId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getPatientPrescriptions(patientId, requesterId, role);
  }

  @Post('vitals')
  @HttpCode(HttpStatus.CREATED)
  @Roles('doctor','nurse','hospital_admin','clinic_admin','system_admin')
  @ApiOperation({ summary: 'Record patient vital signs' })
  async recordVitals(
    @Body() dto: RecordVitalsDto & { patientId: number },
    @CurrentUser('id') recordedBy: number,
    @OrgId() orgId: number,
  ) {
    return this.service.recordVitals(dto.patientId, recordedBy, orgId, dto);
  }

  @Get('patients/:id/vitals')
  @ApiOperation({ summary: 'Get vitals trend for a patient' })
  async getVitalsTrend(
    @Param('id', ParseIntPipe) patientId: number,
    @Query('days', new ParseIntPipe({ optional: true })) days = 30,
  ) {
    return this.service.getVitalsTrend(patientId, days);
  }
}
