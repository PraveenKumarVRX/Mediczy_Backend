import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }

  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'control-plane',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('cp/live')
  liveCp() {
    return {
      status: 'ok',
      service: 'control-plane',
      timestamp: new Date().toISOString(),
    };
  }
}
