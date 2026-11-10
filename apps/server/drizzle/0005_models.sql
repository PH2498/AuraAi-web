DROP INDEX IF EXISTS "provider_configs_user_provider_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "provider_configs_user_ollama_idx" ON "provider_configs" ("user_id") WHERE "provider" = 'ollama';
