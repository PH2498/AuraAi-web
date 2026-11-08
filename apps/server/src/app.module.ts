import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { HealthModule } from './modules/health/health.module';
import { ProvidersModule } from './modules/providers/providers.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.body.password',
            'req.body.apiKey',
          ],
          remove: true,
        },
        genReqId: (request, response) => {
          const header = request.headers['x-request-id'];
          const incoming = Array.isArray(header) ? header[0] : header;
          const id =
            incoming && incoming.length > 0 && incoming.length <= 128 ? incoming : randomUUID();
          response.setHeader('x-request-id', id);
          return id;
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    DatabaseModule,
    HealthModule,
    AuditModule,
    AuthModule,
    AiModule,
    ConversationsModule,
    ProvidersModule,
  ],
})
export class AppModule {}
