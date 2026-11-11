import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    modelProvider: text('model_provider'),
    modelName: text('model_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [index('conversations_user_id_idx').on(table.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: jsonb('content').$type<{ text: string; display?: string; attachments?: { id?: string; name: string; type: 'image' | 'file'; mime?: string }[] }>().notNull(),
    sequence: integer('sequence').notNull(),
    status: text('status').notNull().default('complete'),
    tokenUsage: jsonb('token_usage').$type<{ inputTokens?: number; outputTokens?: number } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('messages_conversation_sequence_idx').on(table.conversationId, table.sequence),
    index('messages_conversation_id_idx').on(table.conversationId),
  ],
);

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    displayName: text('display_name').notNull(),
    encryptedApiKey: text('encrypted_api_key'),
    baseUrl: text('base_url'),
    defaultModel: text('default_model'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('provider_configs_user_ollama_idx').on(table.userId).where(sql`${table.provider} = 'ollama'`)],
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notes_user_id_idx').on(table.userId)],
);

export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goal: text('goal').notNull(),
    status: text('status').notNull(),
    summary: text('summary'),
    plan: jsonb('plan').$type<{ tool: string; input: Record<string, unknown> }[] | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [index('agent_tasks_user_id_idx').on(table.userId)],
);

export const agentSteps = pgTable(
  'agent_steps',
  {
    id: uuid('id').primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => agentTasks.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    toolName: text('tool_name'),
    title: text('title').notNull(),
    status: text('status').notNull(),
    riskLevel: text('risk_level'),
    confirmationStatus: text('confirmation_status'),
    input: jsonb('input').$type<Record<string, unknown> | null>(),
    inputHash: text('input_hash'),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    summary: text('summary'),
    confirmExpiresAt: timestamp('confirm_expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('agent_steps_task_id_idx').on(table.taskId)],
);

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    sourceType: text('source_type').notNull(),
    status: text('status').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('memories_user_id_idx').on(table.userId)],
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('feedback_user_id_idx').on(table.userId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata_json').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_logs_user_id_idx').on(table.userId)],
);
