import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentsRepository } from './repository/appointments.repository';

@Module({
  controllers: [AppointmentsController],
  providers:   [AppointmentsService, AppointmentsRepository],
  exports:     [AppointmentsService],
})
export class AppointmentsModule {}
