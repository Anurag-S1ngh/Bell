CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"actor" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"cluster_type" text NOT NULL,
	"canonical_id" text NOT NULL,
	"member_ids" text[] DEFAULT '{}'::text[],
	"confidence" text,
	"status" text DEFAULT 'proposed',
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"connector_id" text NOT NULL,
	"group_id" text NOT NULL,
	"cursor" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '',
	"attributes" jsonb DEFAULT '{}',
	"visibility" jsonb DEFAULT '{}',
	"name_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"entity_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"alias_type" text DEFAULT 'alias'
);
--> statement-breakpoint
CREATE TABLE "entity_types" (
	"id" text,
	"group_id" text,
	"label" text NOT NULL,
	"description" text DEFAULT '',
	"schema" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_types_pkey" PRIMARY KEY("group_id","id")
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"content" text NOT NULL,
	"content_embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}',
	"visibility" jsonb DEFAULT '{}',
	"valid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"episode_id" uuid,
	"method" text NOT NULL,
	"input_preview" text,
	"entities" jsonb DEFAULT '[]',
	"facts" jsonb DEFAULT '[]',
	"confidence" text,
	"duration_ms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"fact_text" text NOT NULL,
	"fact_embedding" vector(1536),
	"evidence" jsonb DEFAULT '{}',
	"extractor" text DEFAULT '',
	"visibility" jsonb DEFAULT '{}',
	"valid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalid_at" timestamp with time zone,
	"confidence" text DEFAULT '1',
	"source_episode_id" uuid,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizational_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"owner" text,
	"subject" text,
	"value_object" jsonb DEFAULT '{}',
	"due_at" timestamp with time zone,
	"valid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"confidence" text DEFAULT '1',
	"evidence" jsonb DEFAULT '{}',
	"source_episode_id" uuid,
	"visibility" jsonb DEFAULT '{}',
	"metadata" jsonb DEFAULT '{}',
	"content_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relation_types" (
	"id" text,
	"group_id" text,
	"label" text NOT NULL,
	"source_types" text[] DEFAULT '{}'::text[],
	"target_types" text[] DEFAULT '{}'::text[],
	"description" text DEFAULT '',
	"cardinality" text DEFAULT 'many' NOT NULL,
	"invalidation_policy" text DEFAULT 'llm' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relation_types_pkey" PRIMARY KEY("group_id","id")
);
--> statement-breakpoint
CREATE TABLE "skill_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"status" text DEFAULT 'draft',
	"proposal" jsonb DEFAULT '{}',
	"test_results" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "canonical_clusters" ADD CONSTRAINT "canonical_clusters_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "connector_sync_state" ADD CONSTRAINT "connector_sync_state_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entity_types" ADD CONSTRAINT "entity_types_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "extraction_log" ADD CONSTRAINT "extraction_log_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "extraction_log" ADD CONSTRAINT "extraction_log_episode_id_episodes_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id");--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_entity_id_entities_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "entities"("id");--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_target_entity_id_entities_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities"("id");--> statement-breakpoint
ALTER TABLE "organizational_memory" ADD CONSTRAINT "organizational_memory_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "relation_types" ADD CONSTRAINT "relation_types_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "skill_promotions" ADD CONSTRAINT "skill_promotions_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;