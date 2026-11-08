import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AgentController } from './agent.controller';
import { AgentEvents } from './agent.events';
import { AGENT_PLANNER, AgentService } from './agent.service';
import { ModelPlanner } from './planner';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [AgentController],
  providers: [AgentEvents, ModelPlanner, { provide: AGENT_PLANNER, useExisting: ModelPlanner }, AgentService],
})
export class AgentModule {}
