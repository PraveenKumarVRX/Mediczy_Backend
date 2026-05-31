import {
  Controller, Get, Post, Patch, Param, Query, Body,
  ParseIntPipe, ParseFloatPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { HomecareService } from './homecare.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId, Pagination } from '../common/decorators/org-id.decorator';

class BookVisitDto {
  @ApiProperty() @IsNumber() serviceId:      number;
  @ApiProperty() @IsString() address:        string;
  @ApiProperty() @IsNumber() lat:            number;
  @ApiProperty() @IsNumber() lng:            number;
  @ApiProperty() @IsString() scheduledDate:  string;
  @ApiProperty() @IsString() scheduledTime:  string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

@ApiTags('Homecare')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/homecare')
export class HomecareController {
  constructor(private readonly service: HomecareService) {}

  @Public()
  @Get('services')
  @ApiOperation({ summary: 'Search homecare services' })
  async search(
    @Query('city') city?: string,
    @Query('type') type?: string,
    @Pagination() p = { page: 1, limit: 20 },
  ) {
    return this.service.searchServices({ city, serviceType: type, ...p });
  }

  @Post('visits')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book a homecare visit' })
  async book(
    @CurrentUser('id') userId: number,
    @OrgId() orgId: number,
    @Body() dto: BookVisitDto,
  ) {
    return this.service.bookVisit(userId, orgId, dto);
  }

  @Get('visits/my')
  @ApiOperation({ summary: 'Get my homecare visit history' })
  async myVisits(
    @CurrentUser('id') userId: number,
    @Pagination() p = { page: 1, limit: 10 },
  ) {
    return this.service.getMyVisits(userId, p.page, p.limit);
  }

  @Patch('visits/:id/status')
  @ApiOperation({ summary: 'Update visit status (provider)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @Body('notes') notes?: string,
  ) {
    return this.service.updateVisitStatus(id, status, notes);
  }
}
