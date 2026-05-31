import {
  Controller, Get, Post, Param, Query, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CorporateService } from './corporate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Pagination } from '../common/decorators/org-id.decorator';

class AddPlanDto {
  @ApiProperty() @IsString() planName:       string;
  @ApiProperty() @IsNumber() coverageAmount: number;
  @ApiProperty() @IsNumber() annualLimit:    number;
  @ApiProperty() @IsArray()  features:       string[];
  @ApiProperty() @IsString() validFrom:      string;
  @ApiProperty() @IsString() validUntil:     string;
}

@ApiTags('Corporate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/corporate')
export class CorporateController {
  constructor(private readonly service: CorporateService) {}

  @Get(':id/health-dashboard')
  @Roles('corporate_admin','system_admin')
  @ApiOperation({ summary: 'Corporate employee health dashboard' })
  async dashboard(@Param('id', ParseIntPipe) id: number) {
    return this.service.getCorporateHealth(id);
  }

  @Get(':id/employees')
  @Roles('corporate_admin','system_admin')
  @ApiOperation({ summary: 'List employees' })
  async employees(
    @Param('id', ParseIntPipe) id: number,
    @Query('q') q?: string,
    @Pagination() p = { page: 1, limit: 20 },
  ) {
    return this.service.getEmployees(id, p.page, p.limit, q);
  }

  @Get(':id/health-plans')
  @Roles('corporate_admin','system_admin')
  @ApiOperation({ summary: 'Get active health plans' })
  async plans(@Param('id', ParseIntPipe) id: number) {
    return this.service.getHealthPlans(id);
  }

  @Post(':id/health-plans')
  @HttpCode(HttpStatus.CREATED)
  @Roles('corporate_admin','system_admin')
  @ApiOperation({ summary: 'Add a corporate health plan' })
  async addPlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddPlanDto,
  ) {
    return this.service.addHealthPlan(id, dto);
  }
}
