import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { sessions, users } from '../../database/schema';
import { fail } from '../../common/http';
import { hashPassword, hashToken, verifyPassword } from '../../common/secrets';
import { AuditService } from '../audit/audit.service';

const SESSION_COOKIE = 'aura_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;

const LoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export type AuthUser = { id: string; email: string };

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.env.AURA_BOOTSTRAP_EMAIL.trim().toLowerCase();
    const password = this.env.AURA_BOOTSTRAP_PASSWORD;
    if (!email || !password) return;
    const existing = await this.database.db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) return;
    if (password.length < 8) return;
    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      console.error('引导账号无效，已跳过创建。');
      return;
    }
    await this.createUser(email, password);
  }

  async createUser(email: string, password: string): Promise<AuthUser> {
    const normalized = email.trim().toLowerCase();
    const parsed = LoginSchema.safeParse({ email: normalized, password });
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['email', 'password'] });
    const [row] = await this.database.db
      .insert(users)
      .values({
        id: randomUUID(),
        email: normalized,
        passwordHash: await hashPassword(password),
      })
      .returning({ id: users.id, email: users.email });
    if (!row) fail(500, 'INTERNAL_ERROR', '服务暂时不可用');
    return row;
  }

  async login(body: unknown): Promise<{ user: AuthUser; token: string }> {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['email', 'password'] });
    const email = parsed.data.email.toLowerCase();
    const [user] = await this.database.db
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const matches = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
    if (!user || !matches) {
      fail(401, 'UNAUTHORIZED', '邮箱或密码不正确');
    }
    const token = randomBytes(32).toString('base64url');
    await this.database.db.insert(sessions).values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
    });
    await this.audit.record({
      userId: user.id,
      action: 'auth.login',
      resourceType: 'session',
      resourceId: user.id,
      metadata: {},
    });
    return { user: { id: user.id, email: user.email }, token };
  }

  async logout(token: string | null): Promise<void> {
    if (!token) return;
    const tokenHash = hashToken(token);
    const [session] = await this.database.db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    await this.database.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    if (session) {
      await this.audit.record({
        userId: session.userId,
        action: 'auth.logout',
        resourceType: 'session',
        resourceId: session.userId,
        metadata: {},
      });
    }
  }

  async userFromToken(token: string | null): Promise<AuthUser | null> {
    if (!token) return null;
    const [row] = await this.database.db
      .select({ id: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    return row ?? null;
  }

  writeCookie(response: Response, token: string): void {
    response.append('Set-Cookie', this.cookie(token, SESSION_SECONDS));
  }

  clearCookie(response: Response): void {
    response.append('Set-Cookie', this.cookie('', 0));
  }

  private cookie(token: string, maxAge: number): string {
    const parts = [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      `Max-Age=${maxAge}`,
    ];
    if (this.env.NODE_ENV === 'production') parts.push('Secure');
    return parts.join('; ');
  }
}

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}
