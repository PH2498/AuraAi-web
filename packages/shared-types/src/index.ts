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
