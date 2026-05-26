import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, Req, ParseIntPipe,
  DefaultValuePipe, ParseBoolPipe,
  UseGuards, HttpCode,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';

@Controller('api/superadmin/tenants')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class TenantsController {
  constructor(private svc: TenantsService) {}

  @Get('tiers')
  getTiers() { return this.svc.getTiers(); }

  @Get('entity-types')
  getEntityTypes() { return this.svc.getEntityTypes(); }

  @Get('stats')
  getStats() { return this.svc.getStats(); }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll({ page, limit, type, plan, status, search });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTenantDto, @Req() req: any) {
    return this.svc.create(dto, req.user?.email);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantDto,
    @Req() req: any,
  ) {
    return this.svc.update(id, dto, req.user?.email);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.svc.suspend(id, reason, req.user?.email);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.reactivate(id, req.user?.email);
  }

  @Post(':id/upgrade')
  @HttpCode(200)
  upgrade(
    @Param('id', ParseIntPipe) id: number,
    @Body('plan') plan: string,
    @Body('billing_cycle') billing_cycle: string,
    @Req() req: any,
  ) {
    return this.svc.upgrade(id, plan, billing_cycle, req.user?.email);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('hard', new DefaultValuePipe(false), ParseBoolPipe) hard: boolean,
    @Req() req: any,
  ) {
    return this.svc.remove(id, hard, req.user?.email);
  }
}
