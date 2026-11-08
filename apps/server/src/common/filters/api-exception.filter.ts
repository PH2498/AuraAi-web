import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type RequestWithId = Request & { id?: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithId>();
    const requestId = request.id || randomUUID();
    response.setHeader('x-request-id', requestId);

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.toBody(exception, status, requestId);
    const path = (request.originalUrl ?? '').split('?')[0] ?? '';

    if (status >= 500) {
      this.logger.error(`request failed ${status} ${request.method} ${path} ${requestId}`);
    }

    response.status(status).json(body);
  }

  private toBody(exception: unknown, status: number, requestId: string) {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (isStructured(payload)) {
        return {
          code: payload.code,
          message: payload.message,
          requestId,
          ...(payload.details ? { details: payload.details } : {}),
        };
      }
    }

    if (status === HttpStatus.NOT_FOUND) {
      return { code: 'NOT_FOUND', message: '未找到', requestId };
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return { code: 'VALIDATION_ERROR', message: '请求无效', requestId };
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      return { code: 'UNAUTHORIZED', message: '未授权', requestId };
    }
    if (status === HttpStatus.FORBIDDEN) {
      return { code: 'FORBIDDEN', message: '没有权限', requestId };
    }

    return { code: 'INTERNAL_ERROR', message: '服务暂时不可用', requestId };
  }
}

function isStructured(
  payload: unknown,
): payload is { code: string; message: string; details?: Record<string, unknown> } {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return typeof record.code === 'string' && typeof record.message === 'string';
}
