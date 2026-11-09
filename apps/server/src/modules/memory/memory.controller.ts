import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MemoryStatus } from '@aura/shared-types';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { MemoryService } from './memory.service';

function statusOf(value?: string): MemoryStatus | undefined {
  if (!value) return undefined;
  if (value === 'pending' || value === 'active' || value === 'archived') return value;
  fail(400, 'VALIDATION_ERROR', '记忆状态无效');
}

@ApiTags('memories')
@ApiCookieAuth('aura_session')
@Controller('memories')
export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  @Get()
  @ApiOperation({ summary: '列出当前用户的记忆。' })
  list(@Req() request: AuthedRequest, @Query('status') status?: string) {
    return this.memories.list(this.userId(request), statusOf(status));
  }

  @Get('search')
  @ApiOperation({ summary: '搜索当前用户的记忆。' })
  search(@Req() request: AuthedRequest, @Query('q') q?: string, @Query('status') status?: string) {
    return this.memories.search(this.userId(request), q ?? '', statusOf(status));
  }

  @Get(':id')
  @ApiOperation({ summary: '查看一条记忆。' })
  get(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.memories.get(this.userId(request), id);
  }

  @Post()
  @ApiOperation({ summary: '创建记忆。手动添加会直接生效，对话或任务提议先待确认。' })
  create(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.memories.create(this.userId(request), body);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新记忆的内容、分类或固定状态。' })
  update(@Req() request: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.memories.update(this.userId(request), id, body);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '确认一条待审核记忆。确认后才会进入对话上下文。' })
  approve(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.memories.approve(this.userId(request), id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除一条记忆。删除后不再进入对话。' })
  async remove(@Req() request: AuthedRequest, @Param('id') id: string) {
    await this.memories.remove(this.userId(request), id);
    return { ok: true };
  }

  private userId(request: AuthedRequest): string {
    const userId = request.user?.id;
    if (!userId) fail(401, 'UNAUTHORIZED', '未授权');
    return userId;
  }
}
