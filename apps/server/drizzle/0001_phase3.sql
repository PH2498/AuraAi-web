CREATE TABLE "users" (
  "id" uuid PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");

CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "model_provider" text,
  "model_name" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX "conversations_user_id_idx" ON "conversations" ("user_id");

CREATE TABLE "messages" (
  "id" uuid PRIMARY KEY,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" jsonb NOT NULL,
  "sequence" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'complete',
  "token_usage" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "messages_conversation_sequence_idx" ON "messages" ("conversation_id", "sequence");
CREATE INDEX "messages_conversation_id_idx" ON "messages" ("conversation_id");

CREATE TABLE "provider_configs" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "display_name" text NOT NULL,
  "encrypted_api_key" text,
  "base_url" text,
  "default_model" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "provider_configs_user_provider_idx" ON "provider_configs" ("user_id", "provider");

CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text,
  "metadata_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
