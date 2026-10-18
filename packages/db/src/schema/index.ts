import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entityTypes = pgTable(
  "entity_types",
  {
    id: text("id").notNull(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    description: text("description").default(""),
    schema: jsonb("schema").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.id] }) }),
);

export const relationTypes = pgTable(
  "relation_types",
  {
    id: text("id").notNull(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sourceTypes: text("source_types").array().default([]),
    targetTypes: text("target_types").array().default([]),
    description: text("description").default(""),
    cardinality: text("cardinality").notNull().default("many"),
    invalidationPolicy: text("invalidation_policy").notNull().default("llm"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.id] }) }),
);

export const entities = pgTable("entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  name: text("name").notNull(),
  summary: text("summary").default(""),
  attributes: jsonb("attributes").default({}),
  visibility: jsonb("visibility").default({}),
  nameEmbedding: vector("name_embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const facts = pgTable("facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  sourceEntityId: uuid("source_entity_id").notNull().references(() => entities.id),
  targetEntityId: uuid("target_entity_id").notNull().references(() => entities.id),
  relation: text("relation").notNull(),
  factText: text("fact_text").notNull(),
  factEmbedding: vector("fact_embedding", { dimensions: 1536 }),
  evidence: jsonb("evidence").default({}),
  extractor: text("extractor").default(""),
  visibility: jsonb("visibility").default({}),
  validAt: timestamp("valid_at", { withTimezone: true }).notNull().defaultNow(),
  invalidAt: timestamp("invalid_at", { withTimezone: true }),
  confidence: text("confidence").default("1"),
  sourceEpisodeId: uuid("source_episode_id"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const episodes = pgTable("episodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  content: text("content").notNull(),
  contentEmbedding: vector("content_embedding", { dimensions: 1536 }),
  metadata: jsonb("metadata").default({}),
  visibility: jsonb("visibility").default({}),
  validAt: timestamp("valid_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationalMemory = pgTable("organizational_memory", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("open"),
  owner: text("owner"),
  subject: text("subject"),
  valueObject: jsonb("value_object").default({}),
  dueAt: timestamp("due_at", { withTimezone: true }),
  validAt: timestamp("valid_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  confidence: text("confidence").default("1"),
  evidence: jsonb("evidence").default({}),
  sourceEpisodeId: uuid("source_episode_id"),
  visibility: jsonb("visibility").default({}),
  metadata: jsonb("metadata").default({}),
  contentEmbedding: vector("content_embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entityAliases = pgTable("entity_aliases", {
  entityId: uuid("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  aliasType: text("alias_type").default("alias"),
});

export const extractionLog = pgTable("extraction_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").references(() => episodes.id),
  method: text("method").notNull(),
  inputPreview: text("input_preview"),
  entities: jsonb("entities").default([]),
  facts: jsonb("facts").default([]),
  confidence: text("confidence"),
  durationMs: text("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  actor: text("actor"),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const canonicalClusters = pgTable("canonical_clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  clusterType: text("cluster_type").notNull(),
  canonicalId: text("canonical_id").notNull(),
  memberIds: text("member_ids").array().default([]),
  confidence: text("confidence"),
  status: text("status").default("proposed"),
  rationale: text("rationale"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillPromotions = pgTable("skill_promotions", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull(),
  status: text("status").default("draft"),
  proposal: jsonb("proposal").default({}),
  testResults: jsonb("test_results").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connectorSyncState = pgTable("connector_sync_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectorId: text("connector_id").notNull(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  cursor: text("cursor"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const relations = {};