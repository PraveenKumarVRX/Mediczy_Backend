import {
  Controller, Get, Post, Param, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsArray, IsEnum, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WearablesService } from './wearables.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

class RegisterDeviceDto {
  @ApiProperty() @IsString() deviceType:  string;
  @ApiProperty() @IsString() deviceModel: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() deviceSerial?: string;
  @ApiProperty({ enum: ['ios','android','standalone'] })
  @IsEnum(['ios','android','standalone']) platform: 'ios' | 'android' | 'standalone';
}

class SyncDto {
  @ApiProperty() @IsArray() readings: { type: string; value: number; unit: string; recordedAt: string }[];
}

@ApiTags('Wearables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/wearables')
export class WearablesController {
  constructor(private readonly service: WearablesService) {}

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a wearable device' })
  async register(
    @CurrentUser('id') userId: number,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.service.registerDevice(userId, dto);
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get my registered devices' })
  async myDevices(@CurrentUser('id') userId: number) {
    return this.service.getMyDevices(userId);
  }

  @Post('devices/:id/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync readings from wearable device (bulk)' })
  async sync(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) deviceId: number,
    @Body() dto: SyncDto,
  ) {
    return this.service.syncReadings(userId, deviceId, dto.readings);
  }

  @Get('readings/latest')
  @ApiOperation({ summary: 'Get latest reading per metric from wearables' })
  async latest(@CurrentUser('id') userId: number) {
    return this.service.getLatestReadings(userId);
  }
}
