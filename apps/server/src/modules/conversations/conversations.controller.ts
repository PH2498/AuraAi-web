import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { ConversationsService } from './conversations.service';

@ApiTags('conversations')
@ApiCookieAuth('aura_session')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: '列出当前用户的会话' })
  list(@Req() request: AuthedRequest) {
    return this.conversations.list(this.userId(request));
  }

  @Post()
  @ApiOperation({ summary: '创建会话' })
  create(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.conversations.create(this.userId(request), body);
  }

  @Get(':id')
  @ApiOperation({ summary: '读取一个会话' })
  get(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.conversations.get(this.userId(request), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '重命名或归档会话' })
  update(@Req() request: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.conversations.update(this.userId(request), id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除会话及其消息' })
  remove(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.conversations.remove(this.userId(request), id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: '读取会话消息历史' })
  messages(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.conversations.listMessages(this.userId(request), id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: '追加一条消息。这一阶段只保存，不调用模型' })
  addMessage(@Req() request: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.conversations.addMessage(this.userId(request), id, body);
  }

  private userId(request: AuthedRequest): string {
    if (!request.user) fail(401, 'UNAUTHORIZED', '未授权');
    return request.user.id;
  }
}
