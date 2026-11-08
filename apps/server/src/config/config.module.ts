import { Global, Module } from '@nestjs/common';
import { parseEnv, type AppEnv } from './env';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): AppEnv => {
        const parsed = parseEnv(process.env);
        if (!parsed.ok) {
          throw new Error(parsed.message);
        }
        return parsed.env;
      },
    },
  ],
  exports: [ENV],
})
export class AppConfigModule {}
