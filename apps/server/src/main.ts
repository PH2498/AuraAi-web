import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { AppModule } from './app.module';
import { loadEnvFile } from './config/env-file';
import { parseEnv } from './config/env';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const parsed = parseEnv(process.env);
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(
    helmet({
      contentSecurityPolicy: parsed.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.enableCors({
    origin: parsed.env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());

  if (parsed.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AURA API')
      .setDescription('AURA AI HTTP API')
      .setVersion('0.0.0')
      .addCookieAuth('aura_session')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(parsed.env.API_PORT);
  app.get(Logger).log(`API listening on port ${parsed.env.API_PORT}`);
}

void bootstrap();
