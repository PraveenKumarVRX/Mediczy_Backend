import { Module } from '@nestjs/common';
import { HomecareController } from './homecare.controller';
import { HomecareService } from './homecare.service';

@Module({
  controllers: [HomecareController],
  providers:   [HomecareService],
  exports:     [HomecareService],
})
export class HomecareModule {}
