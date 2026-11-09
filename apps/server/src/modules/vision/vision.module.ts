import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { VisionController } from './vision.controller';
import { VisionRuntime } from './vision.runtime';
import { VisionService } from './vision.service';

@Module({
  imports: [AuditModule],
  controllers: [VisionController],
  providers: [VisionRuntime, VisionService],
})
export class VisionModule {}
