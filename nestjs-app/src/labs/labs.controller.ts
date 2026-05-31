import {
  Controller, Get, Post, Patch, Param, Query, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsInt, IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LabsService } from './labs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrgId, Pagination } from '../common/decorators/org-id.decorator';

class CreateLabOrderDto {
  @ApiProperty() @IsInt()   labId:   number;
  @ApiProperty() @IsArray() tests:   { testId: number; name: string }[];
  @ApiProperty({ required: false }) @IsOptional() @IsInt()    doctorId?:    number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() scheduledAt?: string;
}

class UpdateResultDto {
  @ApiProperty() results:   Record<string, any>;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reportUrl?: string;
}

@ApiTags('Labs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/labs')
export class LabsController {
  constructor(private readonly service: LabsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search diagnostic labs' })
  async search(
    @Query('city') city?: string,
    @Query('nablOnly') nablOnly?: string,
    @Query('homeCollection') homeCollection?: string,
    @Pagination() pagination = { page: 1, limit: 20 },
  ) {
    return this.service.searchLabs({
      city,
      nablOnly:       nablOnly === 'true',
      homeCollection: homeCollection === 'true',
      ...pagination,
    });
  }

  @Public()
  @Get(':id/tests')
  @ApiOperation({ summary: 'Get tests offered by a lab' })
  async getTests(
    @Param('id', ParseIntPipe) id: number,
    @Query('category') category?: string,
  ) {
    return this.service.getLabTests(id, category);
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a lab order' })
  async createOrder(
    @CurrentUser('id') userId: number,
    @OrgId() orgId: number,
    @Body() dto: CreateLabOrderDto,
  ) {
    return this.service.createOrder(userId, orgId, dto);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get lab order details' })
  async getOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.getOrder(id, userId);
  }

  @Patch('orders/:id/results')
  @Roles('lab_admin','system_admin','doctor')
  @ApiOperation({ summary: 'Upload lab results (lab admin only)' })
  async updateResults(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResultDto,
  ) {
    return this.service.updateOrderResult(id, dto.results, dto.reportUrl);
  }
}
