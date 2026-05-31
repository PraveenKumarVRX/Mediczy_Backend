import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HospitalsService } from './hospitals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { Pagination } from '../common/decorators/org-id.decorator';

@ApiTags('Hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v2/hospitals')
export class HospitalsController {
  constructor(private readonly service: HospitalsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search hospitals by city/state' })
  async search(
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Pagination() pagination = { page: 1, limit: 20 },
  ) {
    return this.service.search({ city, state, ...pagination });
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findById(id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Hospital ops dashboard — beds + appointment counts' })
  async dashboard(
    @Param('id', ParseIntPipe) id: number,
    @Query('date') dateStr?: string,
  ) {
    return this.service.getDashboard(id, dateStr ? new Date(dateStr) : new Date());
  }
}
