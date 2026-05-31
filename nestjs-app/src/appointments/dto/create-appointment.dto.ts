import {
  IsNotEmpty, IsString, IsOptional, IsInt, IsEnum, IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty() @IsInt()    @IsNotEmpty() doctorId:        number;
  @ApiProperty() @IsString() @IsNotEmpty() doctorName:      string;
  @ApiProperty() @IsString() @IsNotEmpty() patientName:     string;
  @ApiProperty() @IsString() @IsNotEmpty() patientPhone:    string;
  @ApiProperty() @IsDateString()           appointmentDate: string;
  @ApiProperty() @IsString() @IsNotEmpty() appointmentTime: string;
  @ApiProperty({ enum: ['video','audio','chat','in_person'] })
  @IsEnum(['video','audio','chat','in_person'])
  consultationType: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() specialization?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() patientEmail?:   string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?:          string;
}

export class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: ['scheduled','confirmed','completed','cancelled','no_show','rescheduled'] })
  @IsEnum(['scheduled','confirmed','completed','cancelled','no_show','rescheduled'])
  status: string;

  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
