import {
  Controller, Get, Post, Param, Query, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId, Pagination } from '../common/decorators/org-id.decorator';

class AddReadingDto {
  @ApiProperty() @IsString() readingType: string;
  @ApiProperty() @IsNumber() value:       number;
  @ApiProperty() @IsString() unit:        string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() source?:     string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() deviceId?:   string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() recordedAt?: string;
}

@ApiTags('Health')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  // Health Readings
  @Post('readings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a health reading (BP, glucose, SpO2, etc.)' })
  async addReading(
    @CurrentUser('id') userId: number,
    @OrgId() orgId: number,
    @Body() dto: AddReadingDto,
  ) {
    return this.service.addReading(userId, orgId, dto);
  }

  @Get('readings')
  @ApiOperation({ summary: 'Get health readings trend' })
  async getReadings(
    @CurrentUser('id') userId: number,
    @Query('type') type?: string,
    @Query('days', new ParseIntPipe({ optional: true })) days = 30,
  ) {
    return this.service.getReadings(userId, type, days);
  }

  @Get('readings/summary')
  @ApiOperation({ summary: 'Get aggregated health readings summary (cached 5min)' })
  async getSummary(@CurrentUser('id') userId: number) {
    return this.service.getReadingsSummary(userId);
  }

  // Health Coins / Wallet
  @Get('wallet')
  @ApiOperation({ summary: 'Get health coins wallet balance (cached 1min)' })
  async getWallet(@CurrentUser('id') userId: number) {
    return this.service.getWalletBalance(userId);
  }

  @Get('wallet/transactions')
  @ApiOperation({ summary: 'Get health coins transaction history' })
  async getTransactions(
    @CurrentUser('id') userId: number,
    @Pagination() pagination = { page: 1, limit: 20 },
  ) {
    return this.service.getTransactionHistory(userId, pagination.page, pagination.limit);
  }

  // Lookup Values (for UI dropdowns)
  @Public()
  @Get('lookup/:category')
  @ApiOperation({ summary: 'Get lookup values for a category (blood_type, gender, etc.)' })
  async getLookup(
    @Param('category') category: string,
    @Query('tenantId', new ParseIntPipe({ optional: true })) tenantId?: number,
  ) {
    return this.service.getLookupValues(category, tenantId);
  }
}
