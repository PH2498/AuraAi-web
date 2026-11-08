export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface HealthStatus {
  status: 'ok';
  service: 'aura-server';
  time: string;
}

export interface HealthReadyStatus {
  status: 'ok';
  database: 'up';
  time: string;
}

export type AgentTaskStatus =
  | 'queued'
  | 'planning'
  | 'waiting_confirmation'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export type ToolRiskLevel = 'low' | 'medium' | 'high';

export type ConfirmationStatus = 'not_required' | 'pending' | 'approved' | 'rejected' | 'expired';

export interface AgentStepDto {
  id: string;
  toolName: string | null;
  title: string;
  status: string;
  riskLevel: ToolRiskLevel | null;
  confirmationStatus: ConfirmationStatus | null;
  summary: string | null;
  input: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AgentTaskDto {
  id: string;
  goal: string;
  status: AgentTaskStatus;
  summary: string | null;
  steps: AgentStepDto[];
  createdAt: string;
  updatedAt: string;
}

export type AgentEvent =
  | { type: 'task.updated'; taskId: string; task: AgentTaskDto }
  | { type: 'step.started'; taskId: string; step: AgentStepDto }
  | { type: 'step.updated'; taskId: string; step: AgentStepDto }
  | { type: 'confirmation.required'; taskId: string; step: AgentStepDto }
  | { type: 'task.completed'; taskId: string; task: AgentTaskDto }
  | { type: 'task.failed'; taskId: string; task: AgentTaskDto };
