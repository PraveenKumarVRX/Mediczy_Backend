import {
  Controller, Get, Post, Patch, Param, Query, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Pagination } from '../common/decorators/org-id.decorator';

class CreateTenantDto {
  @ApiProperty() @IsString() tenantCode:       string;
  @ApiProperty() @IsString() tenantName:       string;
  @ApiProperty() @IsString() tenantType:       string;
  @ApiProperty() @IsEmail()  contactEmail:     string;
  @ApiProperty() @IsString() subscriptionPlan: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dbStrategy?: string;
}

class UpdateStatusDto {
  @ApiProperty({ enum: ['ACTIVE','SUSPENDED','ARCHIVED'] })
  @IsEnum(['ACTIVE','SUSPENDED','ARCHIVED'])
  status: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}

@ApiTags('Tenant Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/tenants')
export class TenantController {
  constructor(private readonly service: TenantService) {}

  @Get()
  @Roles('system_admin')
  @ApiOperation({ summary: 'List all tenants (platform admin only)' })
  async list(
    @Query('status') status?: string,
    @Query('type')   type?:   string,
    @Pagination() pagination = { page: 1, limit: 20 },
  ) {
    return this.service.listTenants({ status, type, ...pagination });
  }

  @Get('stats')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Platform-wide tenant stats' })
  async stats() {
    return this.service.getPlatformStats();
  }

  @Get(':tenantId')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Get tenant details' })
  async findOne(@Param('tenantId') tenantId: string) {
    return this.service.getTenant(tenantId);
  }

  @Get(':tenantId/usage')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Get tenant resource usage' })
  async usage(@Param('tenantId') tenantId: string) {
    return this.service.getTenantUsage(tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('system_admin')
  @ApiOperation({ summary: 'Create + provision a new tenant' })
  async create(
    @Body() dto: CreateTenantDto,
    @CurrentUser('id') adminId: number,
  ) {
    return this.service.createTenant({ ...dto, createdBy: String(adminId) });
  }

  @Patch(':tenantId/status')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Update tenant status (activate/suspend/archive)' })
  async updateStatus(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.service.updateTenantStatus(tenantId, dto.status, dto.reason);
  }
}
