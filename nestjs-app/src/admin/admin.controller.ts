import {
  Controller, Get, Patch, Post, Param, Query, Body,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsArray, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Pagination } from '../common/decorators/org-id.decorator';

class CreateRoleDto {
  @ApiProperty() @IsString() name:        string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsArray()  permissions: string[];
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v2/admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'System health check (public)' })
  async health() {
    return this.service.getSystemHealth();
  }

  @Get('stats')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Platform-wide statistics' })
  async stats() {
    return this.service.getPlatformStats();
  }

  @Get('audit-logs')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Query platform audit logs' })
  async auditLogs(
    @Query('tenantId')  tenantId?: string,
    @Query('userId', new ParseIntPipe({ optional: true })) userId?: number,
    @Query('eventType') eventType?: string,
    @Query('from')      from?: string,
    @Query('to')        to?: string,
    @Pagination() p = { page: 1, limit: 20 },
  ) {
    return this.service.getAuditLogs({ tenantId, userId, eventType, from, to, ...p });
  }

  @Get('users/search')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Search users across platform' })
  async searchUsers(
    @Query('q') q: string,
    @Pagination() p = { page: 1, limit: 20 },
  ) {
    return this.service.searchUsers(q || '', p.page, p.limit);
  }

  @Patch('users/:id/status')
  @Roles('system_admin')
  @ApiOperation({ summary: 'Activate or suspend a user account' })
  async userStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'active' | 'suspended',
  ) {
    return this.service.toggleUserStatus(id, status);
  }

  @Get('roles')
  @Roles('system_admin')
  @ApiOperation({ summary: 'List all roles' })
  async roles() { return this.service.getRoles(); }

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @Roles('system_admin')
  @ApiOperation({ summary: 'Create a custom role' })
  async createRole(@Body() dto: CreateRoleDto) {
    return this.service.createRole(dto);
  }
}
