import { Module } from '@nestjs/common';
import { AiBrainController } from './ai-brain.controller';
import { AiBrainService } from './ai-brain.service';

@Module({
  controllers: [AiBrainController],
  providers:   [AiBrainService],
  exports:     [AiBrainService],
})
export class AiBrainModule {}
