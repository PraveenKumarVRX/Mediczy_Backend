import {
  Controller, Get, Patch, Delete, Post,
  Param, Query, Body, Req, ParseIntPipe,
  DefaultValuePipe, UseGuards, HttpCode,
} from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';

@Controller('api/superadmin/clinics')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class ClinicsController {
  constructor(private svc: ClinicsService) {}

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAll({ page, limit, status, search });
  }

  @Get('registrations/pending')
  getPending(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.getPendingRegistrations({ page, limit });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) {
    return this.svc.update(id, body, req.user?.email);
  }

  @Post('registrations/:id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.approveRegistration(id, req.user?.email);
  }

  @Post('registrations/:id/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.svc.rejectRegistration(id, reason, req.user?.email);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
