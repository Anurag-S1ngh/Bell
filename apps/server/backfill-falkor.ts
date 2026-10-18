/**
 * Backfill FalkorDB from Postgres (one-off repair/seed helper).
 *
 * Mirrors every entity and fact into the FalkorDB graph projection,
 * including invalidation state. Idempotent — safe to re-run.
 *
 * Run: bun run --cwd apps/server sync:graph
 */
import "./src/env.server";
import { ENV } from "./src/env";
import { createDb } from "@Bell/db";
import { entities, facts } from "@Bell/db/schema/index";
import { FalkorDBClient, FalkorGraph } from "@Bell/graph";
import { isPublicVisibility, type VisibilityPolicy } from "@Bell/knowledge";

const db = createDb(ENV);
const falkorClient = new FalkorDBClient({ url: ENV.FALKORDB_URL });
await falkorClient.connect();
const falkor = new FalkorGraph(falkorClient, ENV.BELL_GROUP_ID);

let entityCount = 0;
let entityErrors = 0;
const allEntities = await db.select().from(entities);
for (const e of allEntities) {
  try {
    await falkor.upsertEntity({
      id: e.id,
      groupId: e.groupId,
      entityType: e.entityType,
      name: e.name,
      summary: e.summary ?? undefined,
      isPublic: isPublicVisibility((e.visibility ?? null) as VisibilityPolicy | null),
    });
    entityCount++;
  } catch (error) {
    entityErrors++;
    console.warn(`entity ${e.id} failed:`, error instanceof Error ? error.message : error);
  }
}

let factCount = 0;
let factErrors = 0;
const allFacts = await db.select().from(facts);
for (const f of allFacts) {
  try {
    const confidenceValue = Number(f.confidence ?? 1);
    await falkor.upsertFact({
      id: f.id,
      groupId: f.groupId,
      sourceEntityId: f.sourceEntityId,
      targetEntityId: f.targetEntityId,
      relation: f.relation,
      factText: f.factText,
      confidence: Number.isFinite(confidenceValue) ? confidenceValue : 1,
      validAtMs: f.validAt instanceof Date ? f.validAt.getTime() : Date.now(),
      sourceEpisodeId: f.sourceEpisodeId ?? undefined,
      isPublic: isPublicVisibility((f.visibility ?? null) as VisibilityPolicy | null),
    });
    if (f.invalidAt) {
      await falkor.setFactInvalidAt({
        id: f.id,
        invalidAtMs: f.invalidAt instanceof Date ? f.invalidAt.getTime() : undefined,
      });
    }
    factCount++;
  } catch (error) {
    factErrors++;
    console.warn(`fact ${f.id} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(
  `backfill done: ${entityCount} entities (${entityErrors} errors), ${factCount} facts (${factErrors} errors)`,
);

await falkorClient.close();
process.exit(entityErrors + factErrors > 0 ? 1 : 0);
