import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { ProvidersService } from './providers.service';

@ApiTags('providers')
@ApiCookieAuth('aura_session')
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  @ApiOperation({ summary: '列出提供方配置。响应不含密钥明文' })
  list(@Req() request: AuthedRequest) {
    return this.providers.list(this.userId(request));
  }

  @Post()
  @ApiOperation({ summary: '保存一个提供方。密钥只以密文入库' })
  create(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.providers.create(this.userId(request), body);
  }

  @Post(':id/test')
  @ApiOperation({ summary: '测试提供方连接。响应不含密钥' })
  test(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.providers.test(this.userId(request), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新提供方配置' })
  update(@Req() request: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.providers.update(this.userId(request), id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除提供方配置' })
  remove(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.providers.remove(this.userId(request), id);
  }

  private userId(request: AuthedRequest): string {
    if (!request.user) fail(401, 'UNAUTHORIZED', '未授权');
    return request.user.id;
  }
}
