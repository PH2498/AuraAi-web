import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../../common/public';
import { fail } from '../../common/http';
import { AuthService, readSessionCookie, type AuthUser } from './auth.service';

export type AuthedRequest = Request & { user?: AuthUser };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.auth.userFromToken(readSessionCookie(request.headers.cookie));
    if (user) request.user = user;
    if (isPublic) return true;
    if (!user) fail(401, 'UNAUTHORIZED', '未授权');
    return true;
  }
}
