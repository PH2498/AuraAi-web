CREATE TABLE "memories" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "source_type" text NOT NULL,
  "status" text NOT NULL,
  "pinned" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "memories_user_id_idx" ON "memories" ("user_id");
