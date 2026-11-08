import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/public';
import { fail } from '../../common/http';
import { AuthService, readSessionCookie } from './auth.service';
import type { AuthedRequest } from './session.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: '使用邮箱和密码登录，写入 HttpOnly 会话' })
  @ApiOkResponse({ description: '返回当前用户，不返回会话令牌' })
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(body);
    this.auth.writeCookie(response, session.token);
    return { user: session.user };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: '退出并清除会话' })
  async logout(@Req() request: AuthedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readSessionCookie(request.headers.cookie));
    this.auth.clearCookie(response);
    return { ok: true };
  }

  @Get('me')
  @ApiCookieAuth('aura_session')
  @ApiOperation({ summary: '读取当前登录用户' })
  me(@Req() request: AuthedRequest) {
    if (!request.user) fail(401, 'UNAUTHORIZED', '未授权');
    return { user: request.user };
  }
}
