CREATE TABLE "notes" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "notes_user_id_idx" ON "notes" ("user_id");

CREATE TABLE "agent_tasks" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "goal" text NOT NULL,
  "status" text NOT NULL,
  "summary" text,
  "plan" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);
CREATE INDEX "agent_tasks_user_id_idx" ON "agent_tasks" ("user_id");

CREATE TABLE "agent_steps" (
  "id" uuid PRIMARY KEY,
  "task_id" uuid NOT NULL REFERENCES "agent_tasks"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "tool_name" text,
  "title" text NOT NULL,
  "status" text NOT NULL,
  "risk_level" text,
  "confirmation_status" text,
  "input" jsonb,
  "input_hash" text,
  "result" jsonb,
  "summary" text,
  "confirm_expires_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz
);
CREATE INDEX "agent_steps_task_id_idx" ON "agent_steps" ("task_id");
