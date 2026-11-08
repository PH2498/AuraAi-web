import { defineConfig } from 'drizzle-kit';
import { loadEnvFile } from './src/config/env-file';
import { parseEnv } from './src/config/env';

loadEnvFile();
const parsed = parseEnv(process.env);
if (!parsed.ok) {
  throw new Error(parsed.message);
}

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: parsed.env.DATABASE_URL,
  },
});
