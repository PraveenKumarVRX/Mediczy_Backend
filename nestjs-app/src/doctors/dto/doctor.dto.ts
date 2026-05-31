import { IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchDoctorsDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() specialization?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() onlineOnly?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() query?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1)  page?:  number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Max(50) limit?: number;
}

export class BookSlotDto {
  @ApiProperty() @IsString() slotId:           string;
  @ApiProperty() @IsString() consultationType: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sessionId?: string;
}

export class CreateScheduleDto {
  @ApiProperty({ description: '0=Sun…6=Sat' }) @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @ApiProperty({ example: '09:00' }) @IsString() startTime:            string;
  @ApiProperty({ example: '17:00' }) @IsString() endTime:              string;
  @ApiProperty({ default: 15 })      @IsInt()    slotDurationMinutes:  number;
  @ApiProperty({ default: 1 })       @IsInt()    maxPatientsPerSlot:   number;
  @ApiProperty({ required: false }) @IsOptional() consultationTypes?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() validFrom?:  string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() validUntil?: string;
}
