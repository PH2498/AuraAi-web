import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { AgentEvent } from '@aura/shared-types';
import { WebSocketServer, type WebSocket } from 'ws';
import { readSessionCookie, AuthService } from '../auth/auth.service';

type Client = WebSocket & { userId?: string };

@Injectable()
export class AgentEvents implements OnApplicationBootstrap, OnApplicationShutdown {
  private server?: WebSocketServer;

  constructor(
    private readonly http: HttpAdapterHost,
    private readonly auth: AuthService,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.http.httpAdapter.getHttpServer();
    this.server = new WebSocketServer({ server: httpServer, path: '/api/v1/agents/events' });
    this.server.on('connection', (socket: Client, request) => {
      void this.auth.userFromToken(readSessionCookie(request.headers.cookie)).then((user) => {
        if (!user) {
          socket.close(4401, '未授权');
          return;
        }
        socket.userId = user.id;
      });
    });
  }

  publish(userId: string, event: AgentEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.server?.clients ?? []) {
      const socket = client as Client;
      if (socket.userId === userId && socket.readyState === socket.OPEN) socket.send(payload);
    }
  }

  onApplicationShutdown(): void {
    this.server?.close();
  }
}
