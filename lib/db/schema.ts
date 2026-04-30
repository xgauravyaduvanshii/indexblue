import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  json,
  varchar,
  integer,
  uuid,
  real,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { generateId } from 'ai';
import { InferSelectModel } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { BuilderProjectMetadata } from '@/lib/builder/project-metadata';
import type {
  CloudInfraCommandPayload,
  CloudInfraMachineMetadata,
  CloudInfraMetricSnapshot,
  CloudInfraProcessSnapshot,
  CloudInfraSandboxPorts,
  PlatformApiKeyStatus,
  PlatformDeviceSessionStatus,
} from '@/lib/cloud/types';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const builderGithubRepoSelection = pgTable(
  'builder_github_repo_selection',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    repoId: text('repo_id').notNull(),
    repoName: text('repo_name').notNull(),
    repoFullName: text('repo_full_name').notNull(),
    repoUrl: text('repo_url').notNull(),
    cloneUrl: text('clone_url').notNull(),
    isPrivate: boolean('is_private').notNull().default(false),
    defaultBranch: text('default_branch'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('builderGithubRepoSelection_userId_idx').on(table.userId),
    uniqueIndex('builderGithubRepoSelection_userId_unique').on(table.userId),
  ],
);

export const builderProject = pgTable(
  'builder_project',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sourceType: text('source_type').notNull(),
    workspacePath: text('workspace_path'),
    theme: text('theme'),
    metadata: jsonb('metadata').$type<BuilderProjectMetadata>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('builderProject_userId_idx').on(table.userId), index('builderProject_chatId_idx').on(table.chatId)],
);

export const builderProjectIntegration = pgTable(
  'builder_project_integration',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: text('project_id')
      .notNull()
      .references(() => builderProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('disconnected'),
    dashboardUrl: text('dashboard_url'),
    webhookStatus: text('webhook_status'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    encryptedCredentials: text('encrypted_credentials'),
    lastCheckedAt: timestamp('last_checked_at'),
    lastCheckStatus: text('last_check_status'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('builderProjectIntegration_projectId_idx').on(table.projectId),
    index('builderProjectIntegration_userId_idx').on(table.userId),
    index('builderProjectIntegration_type_idx').on(table.type),
    uniqueIndex('builderProjectIntegration_projectId_type_provider_unique').on(
      table.projectId,
      table.type,
      table.provider,
    ),
  ],
);

export const builderProjectEnvVar = pgTable(
  'builder_project_env_var',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: text('project_id')
      .notNull()
      .references(() => builderProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    encryptedValue: text('encrypted_value').notNull(),
    isSecret: boolean('is_secret').notNull().default(true),
    source: text('source').notNull().default('manual'),
    fileName: text('file_name').notNull().default('.env.local'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('builderProjectEnvVar_projectId_idx').on(table.projectId),
    index('builderProjectEnvVar_userId_idx').on(table.userId),
    uniqueIndex('builderProjectEnvVar_projectId_key_unique').on(table.projectId, table.key),
  ],
);

export const builderProjectAsset = pgTable(
  'builder_project_asset',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: text('project_id')
      .notNull()
      .references(() => builderProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    sourceType: text('source_type').notNull(),
    status: text('status').notNull().default('queued'),
    name: text('name').notNull(),
    prompt: text('prompt'),
    storageUrl: text('storage_url'),
    storageKey: text('storage_key'),
    mimeType: text('mime_type'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('builderProjectAsset_projectId_idx').on(table.projectId),
    index('builderProjectAsset_userId_idx').on(table.userId),
    index('builderProjectAsset_kind_idx').on(table.kind),
    index('builderProjectAsset_status_idx').on(table.status),
  ],
);

export const builderProjectJob = pgTable(
  'builder_project_job',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: text('project_id')
      .notNull()
      .references(() => builderProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    provider: text('provider'),
    status: text('status').notNull().default('queued'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb('result').$type<Record<string, unknown>>().notNull().default({}),
    logs: jsonb('logs')
      .$type<Array<{ message: string; level: 'info' | 'success' | 'warning' | 'error'; at: string }>>()
      .notNull()
      .default([]),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('builderProjectJob_projectId_idx').on(table.projectId),
    index('builderProjectJob_userId_idx').on(table.userId),
    index('builderProjectJob_kind_idx').on(table.kind),
    index('builderProjectJob_status_idx').on(table.status),
  ],
);

export const builderProjectToolState = pgTable(
  'builder_project_tool_state',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: text('project_id')
      .notNull()
      .references(() => builderProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toolId: text('tool_id').notNull(),
    state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('builderProjectToolState_projectId_idx').on(table.projectId),
    index('builderProjectToolState_userId_idx').on(table.userId),
    uniqueIndex('builderProjectToolState_projectId_toolId_unique').on(table.projectId, table.toolId),
  ],
);

export const builderProjectEvent = pgTable(
  'builder_project_event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    projectId: text('project_id')
      .notNull()
      .references(() => builderProject.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('builderProjectEvent_projectId_idx').on(table.projectId),
    index('builderProjectEvent_projectId_createdAt_idx').on(table.projectId, table.createdAt),
    index('builderProjectEvent_channel_idx').on(table.channel),
  ],
);

export const paintingRun = pgTable(
  'painting_run',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    prompt: text('prompt').notNull().default(''),
    status: text('status').notNull().default('queued'),
    requestPayload: jsonb('request_payload').$type<Record<string, unknown>>().notNull().default({}),
    resultPayload: jsonb('result_payload').$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('paintingRun_userId_idx').on(table.userId),
    index('paintingRun_userId_createdAt_idx').on(table.userId, table.createdAt),
    index('paintingRun_status_idx').on(table.status),
    index('paintingRun_provider_idx').on(table.provider),
  ],
);

export const paintingAsset = pgTable(
  'painting_asset',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    runId: text('run_id')
      .notNull()
      .references(() => paintingRun.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    storageUrl: text('storage_url').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('paintingAsset_runId_idx').on(table.runId),
    index('paintingAsset_userId_idx').on(table.userId),
    index('paintingAsset_role_idx').on(table.role),
  ],
);

export const platformApiKey = pgTable(
  'platform_api_key',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    tokenId: text('token_id').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    status: text('status').$type<PlatformApiKeyStatus>().notNull().default('active'),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('platformApiKey_userId_idx').on(table.userId),
    index('platformApiKey_userId_status_idx').on(table.userId, table.status),
    uniqueIndex('platformApiKey_tokenId_unique').on(table.tokenId),
  ],
);

export const platformDeviceSession = pgTable(
  'platform_device_session',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    code: text('code').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status').$type<PlatformDeviceSessionStatus>().notNull().default('pending'),
    requestedLabel: text('requested_label'),
    apiKeyId: text('api_key_id').references(() => platformApiKey.id, { onDelete: 'set null' }),
    encryptedApiKey: text('encrypted_api_key'),
    expiresAt: timestamp('expires_at').notNull(),
    approvedAt: timestamp('approved_at'),
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('platformDeviceSession_code_unique').on(table.code),
    index('platformDeviceSession_status_idx').on(table.status),
    index('platformDeviceSession_userId_idx').on(table.userId),
  ],
);

export const cloudInfraMachine = pgTable(
  'cloud_infra_machine',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    apiKeyId: text('api_key_id').references(() => platformApiKey.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    machineId: text('machine_id').notNull(),
    hostname: text('hostname'),
    platform: text('platform'),
    arch: text('arch'),
    release: text('release'),
    nodeVersion: text('node_version'),
    cliVersion: text('cli_version'),
    status: text('status').notNull().default('offline'),
    connectedAt: timestamp('connected_at'),
    lastSeenAt: timestamp('last_seen_at'),
    lastHeartbeatAt: timestamp('last_heartbeat_at'),
    latencyMs: integer('latency_ms'),
    totalCommands: integer('total_commands').notNull().default(0),
    totalFsOps: integer('total_fs_ops').notNull().default(0),
    totalDataTransferred: integer('total_data_transferred').notNull().default(0),
    latestMetrics: jsonb('latest_metrics').$type<CloudInfraMetricSnapshot | null>().default(null),
    latestProcesses: jsonb('latest_processes')
      .$type<CloudInfraProcessSnapshot[]>()
      .notNull()
      .default([]),
    metadata: jsonb('metadata')
      .$type<CloudInfraMachineMetadata>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('cloudInfraMachine_userId_idx').on(table.userId),
    index('cloudInfraMachine_userId_status_idx').on(table.userId, table.status),
    uniqueIndex('cloudInfraMachine_userId_machineId_unique').on(table.userId, table.machineId),
  ],
);

export const cloudInfraMetric = pgTable(
  'cloud_infra_metric',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    infraId: text('infra_id')
      .notNull()
      .references(() => cloudInfraMachine.id, { onDelete: 'cascade' }),
    cpuPercent: real('cpu_percent').notNull().default(0),
    memoryPercent: real('memory_percent').notNull().default(0),
    uptimeSeconds: integer('uptime_seconds').notNull().default(0),
    networkRxBytes: integer('network_rx_bytes').notNull().default(0),
    networkTxBytes: integer('network_tx_bytes').notNull().default(0),
    processCount: integer('process_count').notNull().default(0),
    sandboxCount: integer('sandbox_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('cloudInfraMetric_infraId_idx').on(table.infraId),
    index('cloudInfraMetric_infraId_createdAt_idx').on(table.infraId, table.createdAt),
  ],
);

export const cloudInfraSandbox = pgTable(
  'cloud_infra_sandbox',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    infraId: text('infra_id')
      .notNull()
      .references(() => cloudInfraMachine.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    rootPath: text('root_path').notNull(),
    startCommand: text('start_command'),
    status: text('status').notNull().default('stopped'),
    pid: integer('pid'),
    ports: jsonb('ports')
      .$type<CloudInfraSandboxPorts>()
      .notNull()
      .default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    startCount: integer('start_count').notNull().default(0),
    lastStartedAt: timestamp('last_started_at'),
    lastStoppedAt: timestamp('last_stopped_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('cloudInfraSandbox_infraId_idx').on(table.infraId),
    uniqueIndex('cloudInfraSandbox_infraId_slug_unique').on(table.infraId, table.slug),
  ],
);

export const cloudInfraCommand = pgTable(
  'cloud_infra_command',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    infraId: text('infra_id')
      .notNull()
      .references(() => cloudInfraMachine.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: text('status').notNull().default('queued'),
    payload: jsonb('payload')
      .$type<CloudInfraCommandPayload>()
      .notNull()
      .default({}),
    result: jsonb('result').$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('cloudInfraCommand_infraId_idx').on(table.infraId),
    index('cloudInfraCommand_userId_idx').on(table.userId),
    index('cloudInfraCommand_infraId_status_createdAt_idx').on(table.infraId, table.status, table.createdAt),
  ],
);

export const cloudInfraCommandEvent = pgTable(
  'cloud_infra_command_event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    commandId: text('command_id')
      .notNull()
      .references(() => cloudInfraCommand.id, { onDelete: 'cascade' }),
    infraId: text('infra_id')
      .notNull()
      .references(() => cloudInfraMachine.id, { onDelete: 'cascade' }),
    stream: text('stream').notNull().default('stdout'),
    message: text('message').notNull(),
    sequence: integer('sequence').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('cloudInfraCommandEvent_commandId_idx').on(table.commandId),
    index('cloudInfraCommandEvent_infraId_idx').on(table.infraId),
    index('cloudInfraCommandEvent_commandId_sequence_idx').on(table.commandId, table.sequence),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const chat = pgTable(
  'chat',
  {
    id: text('id')
      .primaryKey()
      .notNull()
      .$defaultFn(() => uuidv7()),
    userId: text('userId')
      .notNull()
      .references(() => user.id),
    title: text('title').notNull().default('New Chat'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    isPinned: boolean('is_pinned').notNull().default(false),
    visibility: varchar('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('private'),
  },
  (table) => [
    index('chat_userId_idx').on(table.userId),
    index('chat_userId_createdAt_idx').on(table.userId, table.createdAt),
    index('chat_userId_isPinned_updatedAt_idx').on(table.userId, table.isPinned, table.updatedAt),
  ],
);

export const message = pgTable(
  'message',
  {
    id: text('id')
      .primaryKey()
      .notNull()
      .$defaultFn(() => generateId()),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user, assistant, or tool
    parts: json('parts').notNull(), // Store parts as JSON in the database
    attachments: json('attachments').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    completionTime: real('completion_time'),
  },
  (table) => [
    index('message_chatId_idx').on(table.chatId),
    index('message_chatId_createdAt_idx').on(table.chatId, table.createdAt),
  ],
);

export const stream = pgTable(
  'stream',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: text('chatId')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [index('stream_chatId_idx').on(table.chatId)],
);

// Subscription table for Polar webhook data
export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    createdAt: timestamp('createdAt').notNull(),
    modifiedAt: timestamp('modifiedAt'),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    recurringInterval: text('recurringInterval').notNull(),
    status: text('status').notNull(),
    currentPeriodStart: timestamp('currentPeriodStart').notNull(),
    currentPeriodEnd: timestamp('currentPeriodEnd').notNull(),
    cancelAtPeriodEnd: boolean('cancelAtPeriodEnd').notNull().default(false),
    canceledAt: timestamp('canceledAt'),
    startedAt: timestamp('startedAt').notNull(),
    endsAt: timestamp('endsAt'),
    endedAt: timestamp('endedAt'),
    customerId: text('customerId').notNull(),
    productId: text('productId').notNull(),
    discountId: text('discountId'),
    checkoutId: text('checkoutId').notNull(),
    customerCancellationReason: text('customerCancellationReason'),
    customerCancellationComment: text('customerCancellationComment'),
    metadata: text('metadata'), // JSON string
    customFieldData: text('customFieldData'), // JSON string
    userId: text('userId').references(() => user.id),
  },
  (table) => [
    index('subscription_userId_idx').on(table.userId),
    index('subscription_userId_status_idx').on(table.userId, table.status),
  ],
);

// Extreme search usage tracking table
export const extremeSearchUsage = pgTable(
  'extreme_search_usage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    searchCount: integer('search_count').notNull().default(0),
    date: timestamp('date').notNull().defaultNow(),
    resetAt: timestamp('reset_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('extremeSearchUsage_userId_idx').on(table.userId),
    index('extremeSearchUsage_userId_date_idx').on(table.userId, table.date),
    // Unique constraint for atomic upserts (one record per user per month)
    uniqueIndex('extremeSearchUsage_userId_date_unique').on(table.userId, table.date),
  ],
);

// Message usage tracking table
export const messageUsage = pgTable(
  'message_usage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    messageCount: integer('message_count').notNull().default(0),
    date: timestamp('date').notNull().defaultNow(),
    resetAt: timestamp('reset_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('messageUsage_userId_idx').on(table.userId),
    index('messageUsage_userId_date_idx').on(table.userId, table.date),
    // Unique constraint for atomic upserts (one record per user per day)
    uniqueIndex('messageUsage_userId_date_unique').on(table.userId, table.date),
  ],
);

// Anthropic daily usage tracking table
export const anthropicUsage = pgTable(
  'anthropic_usage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    usageCount: integer('usage_count').notNull().default(0),
    date: timestamp('date').notNull().defaultNow(),
    resetAt: timestamp('reset_at').notNull(),
    metadata: jsonb('metadata').$type<{
      lastModel?: string;
    } | null>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('anthropicUsage_userId_idx').on(table.userId),
    index('anthropicUsage_userId_date_idx').on(table.userId, table.date),
    uniqueIndex('anthropicUsage_userId_date_unique').on(table.userId, table.date),
  ],
);

// Google (Gemini Max) monthly usage tracking table
export const googleUsage = pgTable(
  'google_usage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    usageCount: integer('usage_count').notNull().default(0),
    date: timestamp('date').notNull().defaultNow(),
    resetAt: timestamp('reset_at').notNull(),
    metadata: jsonb('metadata').$type<{
      lastModel?: string;
    } | null>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('googleUsage_userId_idx').on(table.userId),
    index('googleUsage_userId_date_idx').on(table.userId, table.date),
    uniqueIndex('googleUsage_userId_date_unique').on(table.userId, table.date),
  ],
);

// Agent mode monthly usage tracking (append-only events keyed by user message id)
// This prevents usage from being bypassed by deleting sessions/chats.
export const agentModeUsageEvents = pgTable(
  'agent_mode_usage_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The agent request's latest user message id (idempotency key).
    messageId: text('message_id').notNull(),
    date: timestamp('date').notNull().defaultNow(), // month start
    resetAt: timestamp('reset_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('agentModeUsageEvents_userId_idx').on(table.userId),
    index('agentModeUsageEvents_userId_date_idx').on(table.userId, table.date),
    uniqueIndex('agentModeUsageEvents_messageId_unique').on(table.messageId),
    uniqueIndex('agentModeUsageEvents_userId_date_messageId_unique').on(table.userId, table.date, table.messageId),
  ],
);

// Custom instructions table
export const customInstructions = pgTable(
  'custom_instructions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('customInstructions_userId_idx').on(table.userId)],
);

// User preferences table
export const userPreferences = pgTable('user_preferences', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  preferences: json('preferences')
    .$type<{
      'scira-search-provider'?: 'exa' | 'parallel' | 'firecrawl';
      'scira-extreme-search-model'?:
        | 'scira-ext-1'
        | 'scira-ext-2'
        | 'scira-ext-4'
        | 'scira-ext-5'
        | 'scira-ext-6'
        | 'scira-ext-7'
        | 'scira-ext-8';
      'scira-group-order'?: string[];
      'scira-model-order-global'?: string[];
      'scira-blur-personal-info'?: boolean;
      'scira-custom-instructions-enabled'?: boolean;
      'scira-scroll-to-latest-on-open'?: boolean;
      'scira-location-metadata-enabled'?: boolean;
      'scira-auto-router-enabled'?: boolean;
      'scira-auto-router-config'?: {
        routes: Array<{
          name: string;
          description: string;
          model: string;
        }>;
      };
      'scira-preferred-models'?: string[];
      'scira-visible-modes'?: string[];
      'paintings-provider'?: string;
      'paintings-model'?: string;
      'paintings-size'?: string;
      'paintings-operation'?: 'generate' | 'edit' | 'remix' | 'upscale';
      'paintings-count'?: number;
      'paintings-quality'?: string;
      'paintings-background'?: string;
      'paintings-seed'?: number | null;
      'paintings-negative-prompt'?: string;
      'paintings-prompt-upsampling'?: boolean;
      'paintings-history-query'?: string;
      'paintings-history-status'?: 'all' | 'running' | 'completed' | 'error';
      'paintings-history-provider'?: string;
    }>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Payment table for Dodo Payments webhook data
export const payment = pgTable('payment', {
  id: text('id').primaryKey(), // payment_id from webhook
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at'),
  brandId: text('brand_id'),
  businessId: text('business_id'),
  cardIssuingCountry: text('card_issuing_country'),
  cardLastFour: text('card_last_four'),
  cardNetwork: text('card_network'),
  cardType: text('card_type'),
  currency: text('currency').notNull(),
  digitalProductsDelivered: boolean('digital_products_delivered').default(false),
  discountId: text('discount_id'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  paymentLink: text('payment_link'),
  paymentMethod: text('payment_method'),
  paymentMethodType: text('payment_method_type'),
  settlementAmount: integer('settlement_amount'),
  settlementCurrency: text('settlement_currency'),
  settlementTax: integer('settlement_tax'),
  status: text('status'),
  subscriptionId: text('subscription_id'),
  tax: integer('tax'),
  totalAmount: integer('total_amount').notNull(),
  // JSON fields for complex objects
  billing: json('billing'), // Billing address object
  customer: json('customer'), // Customer data object
  disputes: json('disputes'), // Disputes array
  metadata: json('metadata'), // Metadata object
  productCart: json('product_cart'), // Product cart array
  refunds: json('refunds'), // Refunds array
  // Foreign key to user
  userId: text('user_id').references(() => user.id),
});

// Dodo Subscription table for Dodo Payments subscription webhook data
export const dodosubscription = pgTable(
  'dodosubscription',
  {
    id: text('id').primaryKey(), // subscription_id from webhook
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at'),
    status: text('status').notNull(), // active, on_hold, cancelled, expired, failed
    productId: text('product_id').notNull(),
    customerId: text('customer_id').notNull(),
    businessId: text('business_id'),
    brandId: text('brand_id'),
    currency: text('currency').notNull(),
    amount: integer('amount').notNull(),
    interval: text('interval'), // monthly, yearly, etc.
    intervalCount: integer('interval_count'),
    trialPeriodDays: integer('trial_period_days'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelledAt: timestamp('cancelled_at'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    endedAt: timestamp('ended_at'),
    discountId: text('discount_id'),
    // JSON fields for complex objects
    customer: json('customer'), // Customer data object
    metadata: json('metadata'), // Metadata object
    productCart: json('product_cart'), // Product cart array
    // Foreign key to user
    userId: text('user_id').references(() => user.id),
  },
  (table) => [
    index('dodosubscription_userId_idx').on(table.userId),
    index('dodosubscription_userId_status_idx').on(table.userId, table.status),
    index('dodosubscription_customerId_idx').on(table.customerId),
  ],
);

// Lookout table for scheduled searches
export const lookout = pgTable(
  'lookout',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    prompt: text('prompt').notNull(),
    frequency: text('frequency').notNull(), // 'once', 'daily', 'weekly', 'monthly', 'yearly'
    cronSchedule: text('cron_schedule').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    nextRunAt: timestamp('next_run_at').notNull(),
    qstashScheduleId: text('qstash_schedule_id'),
    status: text('status').notNull().default('active'), // 'active', 'paused', 'archived', 'running'
    searchMode: text('search_mode').notNull().default('extreme'), // Search mode: 'extreme', 'web', 'academic', 'youtube', 'reddit', 'github', 'stocks', 'crypto', 'code', 'x', 'chat'
    lastRunAt: timestamp('last_run_at'),
    lastRunChatId: text('last_run_chat_id'),
    // Store all run history as JSON
    runHistory: json('run_history')
      .$type<
        Array<{
          runAt: string; // ISO date string
          chatId: string;
          status: 'success' | 'error' | 'timeout';
          error?: string;
          duration?: number; // milliseconds
          tokensUsed?: number;
          searchesPerformed?: number;
        }>
      >()
      .default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('lookout_userId_idx').on(table.userId),
    index('lookout_userId_status_idx').on(table.userId, table.status),
  ],
);

export const userMcpServer = pgTable(
  'user_mcp_server',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    transportType: varchar('transport_type', { enum: ['http', 'sse'] })
      .notNull()
      .default('http'),
    url: text('url').notNull(),
    authType: varchar('auth_type', { enum: ['none', 'bearer', 'header', 'oauth'] })
      .notNull()
      .default('none'),
    encryptedCredentials: text('encrypted_credentials'),
    oauthIssuerUrl: text('oauth_issuer_url'),
    oauthAuthorizationUrl: text('oauth_authorization_url'),
    oauthTokenUrl: text('oauth_token_url'),
    oauthScopes: text('oauth_scopes'),
    oauthClientId: text('oauth_client_id'),
    oauthClientSecretEncrypted: text('oauth_client_secret_encrypted'),
    oauthAccessTokenEncrypted: text('oauth_access_token_encrypted'),
    oauthRefreshTokenEncrypted: text('oauth_refresh_token_encrypted'),
    oauthAccessTokenExpiresAt: timestamp('oauth_access_token_expires_at'),
    oauthConnectedAt: timestamp('oauth_connected_at'),
    oauthError: text('oauth_error'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    disabledTools: json('disabled_tools').$type<string[]>().default([]),
    lastTestedAt: timestamp('last_tested_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('userMcpServer_userId_idx').on(table.userId),
    index('userMcpServer_userId_enabled_idx').on(table.userId, table.isEnabled),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  chats: many(chat),
  builderProjects: many(builderProject),
  builderProjectIntegrations: many(builderProjectIntegration),
  builderProjectEnvVars: many(builderProjectEnvVar),
  builderProjectAssets: many(builderProjectAsset),
  builderProjectJobs: many(builderProjectJob),
  builderProjectToolStates: many(builderProjectToolState),
  builderProjectEvents: many(builderProjectEvent),
  paintingRuns: many(paintingRun),
  paintingAssets: many(paintingAsset),
  extremeSearchUsages: many(extremeSearchUsage),
  messageUsages: many(messageUsage),
  anthropicUsages: many(anthropicUsage),
  googleUsages: many(googleUsage),
  agentModeUsageEvents: many(agentModeUsageEvents),
  customInstructions: many(customInstructions),
  userPreferences: many(userPreferences),
  payments: many(payment),
  dodoSubscriptions: many(dodosubscription),
  lookouts: many(lookout),
  mcpServers: many(userMcpServer),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(message),
  streams: many(stream),
}));

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
}));

export const streamRelations = relations(stream, ({ one }) => ({
  chat: one(chat, {
    fields: [stream.chatId],
    references: [chat.id],
  }),
}));

export const lookoutRelations = relations(lookout, ({ one }) => ({
  user: one(user, {
    fields: [lookout.userId],
    references: [user.id],
  }),
}));

export const userMcpServerRelations = relations(userMcpServer, ({ one }) => ({
  user: one(user, {
    fields: [userMcpServer.userId],
    references: [user.id],
  }),
}));

export const buildSession = pgTable(
  'build_session',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    boxId: text('box_id'),
    runtime: text('runtime').notNull().default('node'),
    status: text('status').notNull().default('active'), // 'active', 'completed', 'error', 'deleted'
    snapshotId: text('snapshot_id'),
    totalCostUsd: real('total_cost_usd'),
    totalComputeMs: integer('total_compute_ms'),
    totalInputTokens: integer('total_input_tokens'),
    totalOutputTokens: integer('total_output_tokens'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('build_session_chatId_idx').on(table.chatId),
    index('build_session_userId_idx').on(table.userId),
    index('build_session_userId_status_idx').on(table.userId, table.status),
  ],
);

export const buildSessionRelations = relations(buildSession, ({ one }) => ({
  chat: one(chat, {
    fields: [buildSession.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [buildSession.userId],
    references: [user.id],
  }),
}));

export const builderProjectRelations = relations(builderProject, ({ one, many }) => ({
  chat: one(chat, {
    fields: [builderProject.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [builderProject.userId],
    references: [user.id],
  }),
  integrations: many(builderProjectIntegration),
  envVars: many(builderProjectEnvVar),
  assets: many(builderProjectAsset),
  jobs: many(builderProjectJob),
  toolStates: many(builderProjectToolState),
  events: many(builderProjectEvent),
}));

export const builderProjectIntegrationRelations = relations(builderProjectIntegration, ({ one }) => ({
  project: one(builderProject, {
    fields: [builderProjectIntegration.projectId],
    references: [builderProject.id],
  }),
  user: one(user, {
    fields: [builderProjectIntegration.userId],
    references: [user.id],
  }),
}));

export const builderProjectEnvVarRelations = relations(builderProjectEnvVar, ({ one }) => ({
  project: one(builderProject, {
    fields: [builderProjectEnvVar.projectId],
    references: [builderProject.id],
  }),
  user: one(user, {
    fields: [builderProjectEnvVar.userId],
    references: [user.id],
  }),
}));

export const builderProjectAssetRelations = relations(builderProjectAsset, ({ one }) => ({
  project: one(builderProject, {
    fields: [builderProjectAsset.projectId],
    references: [builderProject.id],
  }),
  user: one(user, {
    fields: [builderProjectAsset.userId],
    references: [user.id],
  }),
}));

export const builderProjectJobRelations = relations(builderProjectJob, ({ one }) => ({
  project: one(builderProject, {
    fields: [builderProjectJob.projectId],
    references: [builderProject.id],
  }),
  user: one(user, {
    fields: [builderProjectJob.userId],
    references: [user.id],
  }),
}));

export const builderProjectToolStateRelations = relations(builderProjectToolState, ({ one }) => ({
  project: one(builderProject, {
    fields: [builderProjectToolState.projectId],
    references: [builderProject.id],
  }),
  user: one(user, {
    fields: [builderProjectToolState.userId],
    references: [user.id],
  }),
}));

export const builderProjectEventRelations = relations(builderProjectEvent, ({ one }) => ({
  project: one(builderProject, {
    fields: [builderProjectEvent.projectId],
    references: [builderProject.id],
  }),
  user: one(user, {
    fields: [builderProjectEvent.userId],
    references: [user.id],
  }),
}));

export const paintingRunRelations = relations(paintingRun, ({ one, many }) => ({
  user: one(user, {
    fields: [paintingRun.userId],
    references: [user.id],
  }),
  assets: many(paintingAsset),
}));

export const paintingAssetRelations = relations(paintingAsset, ({ one }) => ({
  run: one(paintingRun, {
    fields: [paintingAsset.runId],
    references: [paintingRun.id],
  }),
  user: one(user, {
    fields: [paintingAsset.userId],
    references: [user.id],
  }),
}));

export type User = InferSelectModel<typeof user>;
export type Session = InferSelectModel<typeof session>;
export type Account = InferSelectModel<typeof account>;
export type BuilderProject = InferSelectModel<typeof builderProject>;
export type BuilderProjectIntegration = InferSelectModel<typeof builderProjectIntegration>;
export type BuilderProjectEnvVar = InferSelectModel<typeof builderProjectEnvVar>;
export type BuilderProjectAsset = InferSelectModel<typeof builderProjectAsset>;
export type BuilderProjectJob = InferSelectModel<typeof builderProjectJob>;
export type BuilderProjectToolState = InferSelectModel<typeof builderProjectToolState>;
export type BuilderProjectEvent = InferSelectModel<typeof builderProjectEvent>;
export type PaintingRun = InferSelectModel<typeof paintingRun>;
export type PaintingAsset = InferSelectModel<typeof paintingAsset>;
export type PlatformApiKey = InferSelectModel<typeof platformApiKey>;
export type PlatformDeviceSession = InferSelectModel<typeof platformDeviceSession>;
export type CloudInfraMachine = InferSelectModel<typeof cloudInfraMachine>;
export type CloudInfraMetric = InferSelectModel<typeof cloudInfraMetric>;
export type CloudInfraSandbox = InferSelectModel<typeof cloudInfraSandbox>;
export type CloudInfraCommand = InferSelectModel<typeof cloudInfraCommand>;
export type CloudInfraCommandEvent = InferSelectModel<typeof cloudInfraCommandEvent>;
export type Verification = InferSelectModel<typeof verification>;
export type Chat = InferSelectModel<typeof chat>;
export type Message = InferSelectModel<typeof message>;
export type Stream = InferSelectModel<typeof stream>;
export type Subscription = InferSelectModel<typeof subscription>;
export type Payment = InferSelectModel<typeof payment>;
export type DodoSubscription = InferSelectModel<typeof dodosubscription>;
export type ExtremeSearchUsage = InferSelectModel<typeof extremeSearchUsage>;
export type MessageUsage = InferSelectModel<typeof messageUsage>;
export type AnthropicUsage = InferSelectModel<typeof anthropicUsage>;
export type GoogleUsage = InferSelectModel<typeof googleUsage>;
export type AgentModeUsageEvents = InferSelectModel<typeof agentModeUsageEvents>;
export type CustomInstructions = InferSelectModel<typeof customInstructions>;
export type UserPreferences = InferSelectModel<typeof userPreferences>;
export type Lookout = InferSelectModel<typeof lookout>;
export type UserMcpServer = InferSelectModel<typeof userMcpServer>;
export type BuildSession = InferSelectModel<typeof buildSession>;
