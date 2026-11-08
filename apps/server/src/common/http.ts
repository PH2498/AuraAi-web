import { HttpException } from '@nestjs/common';

export function fail(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new HttpException(details ? { code, message, details } : { code, message }, status);
}
