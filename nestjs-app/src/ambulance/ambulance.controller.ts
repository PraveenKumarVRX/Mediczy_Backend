import {
  Controller, Get, Post, Param, Query, Body,
  ParseIntPipe, ParseFloatPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AmbulanceService } from './ambulance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId } from '../common/decorators/org-id.decorator';

class LocationDto {
  @ApiProperty() @IsNumber() lat:     number;
  @ApiProperty() @IsNumber() lng:     number;
  @ApiProperty() @IsString() address: string;
}

class DispatchDto {
  @ApiProperty() @IsString() patientName:   string;
  @ApiProperty() @IsString() patientPhone:  string;
  @ApiProperty() @ValidateNested() @Type(() => LocationDto) location: LocationDto;
  @ApiProperty() @IsString() emergencyType: string;
  @ApiProperty() @IsString() severity:      string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

@ApiTags('Ambulance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/ambulance')
export class AmbulanceController {
  constructor(private readonly service: AmbulanceService) {}

  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Find nearest available ambulances' })
  async nearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius', new ParseIntPipe({ optional: true })) radius = 10,
  ) {
    return this.service.searchNearby(lat, lng, radius);
  }

  @Post('dispatch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request emergency ambulance dispatch' })
  async dispatch(
    @CurrentUser('id') userId: number,
    @OrgId() orgId: number,
    @Body() dto: DispatchDto,
  ) {
    return this.service.dispatchEmergency(userId, orgId, dto);
  }

  @Get('dispatch/:id')
  @ApiOperation({ summary: 'Get dispatch status and ambulance location' })
  async status(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDispatchStatus(id);
  }
}
