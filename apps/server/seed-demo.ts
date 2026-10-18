/**
 * Seed demo data for recordings and walkthroughs (idempotent).
 *
 * POSTs a small connected knowledge graph through /api/ingest, which fills
 * Postgres and — via the ingest mirror — FalkorDB in one pass. Fixed
 * sourceIds make re-runs dedup instead of duplicating.
 *
 * Run: bun run --cwd apps/server seed:demo
 * Env: API_URL (default http://localhost:3000), BELL_AUTH_TOKEN (if set)
 */
import "./src/env.server";

const API = process.env.API_URL || "http://localhost:3000";
const TOKEN = process.env.BELL_AUTH_TOKEN || "";

interface SeedDoc {
  sourceId: string;
  sourceType: string;
  content: string;
}

const DOCS: SeedDoc[] = [
  {
    sourceId: "demo-seed-team",
    sourceType: "doc",
    content:
      "Bell engineering roster, October 2026. Alice Chen (alice@example.com) leads the platform team. " +
      "Bob Kumar (bob@example.com) leads the search team. " +
      "The platform team owns the knowledge graph storage layer. The search team owns the keyword search service.",
  },
  {
    sourceId: "demo-seed-adr-001",
    sourceType: "doc",
    content:
      "Architecture decision record ADR-001, 2026-10-10. The Bell platform team selected FalkorDB as the primary " +
      "graph database for production use. Owner: Alice Chen. Rationale: native Cypher query support and " +
      "Redis-protocol compatibility for the knowledge graph storage layer. Status: accepted and binding.",
  },
  {
    sourceId: "demo-seed-adr-002",
    sourceType: "doc",
    content:
      "Architecture decision record ADR-002, 2026-10-12. The Bell platform team selected the Gemini embedding model " +
      "for passage and entity embeddings, truncated to 1536 dimensions to match the pgvector columns. " +
      "Owner: Alice Chen. Status: accepted.",
  },
  {
    sourceId: "demo-seed-adr-003",
    sourceType: "doc",
    content:
      "Architecture decision record ADR-003, 2026-10-14. The Bell search team owns the keyword search service. " +
      "Owner: Bob Kumar. The service ranks passages with BM25 full-text search before LLM reranking. Status: accepted.",
  },
  {
    sourceId: "demo-seed-policy-001",
    sourceType: "doc",
    content:
      "Bell answer quality policy, October 2026. All answers served by Bell must cite their supporting sources with " +
      "quotes. Interpretations beyond the cited text must be labeled as inference. Owner: platform team. Status: enforced.",
  },
  {
    sourceId: "demo-seed-adr-004",
    sourceType: "doc",
    content:
      "Architecture decision record ADR-004, 2026-10-16. The earlier proposal to use RedisGraph as the graph database " +
      "is rejected and superseded by ADR-001. RedisGraph is not used. The team uses FalkorDB as the primary graph " +
      "database. Owner: Alice Chen. Status: accepted, supersedes the RedisGraph proposal.",
  },
];

interface IngestResult {
  episodeId?: string;
  entitiesCreated?: number;
  entitiesUpdated?: number;
  factsCreated?: number;
  factsInvalidated?: number;
  memoryCreated?: number;
  skipped?: boolean;
  skipReason?: string;
  graphSynced?: boolean;
  error?: string;
}

async function main(): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  let failed = 0;
  for (const doc of DOCS) {
    let row: IngestResult;
    try {
      const res = await fetch(`${API}/api/ingest`, {
        method: "POST",
        headers,
        body: JSON.stringify(doc),
      });
      row = (await res.json()) as IngestResult;
      if (!res.ok || row.error) throw new Error(row.error ?? `HTTP ${res.status}`);
    } catch (error) {
      failed++;
      console.log(
        `${doc.sourceId}: ERROR ${error instanceof Error ? error.message.slice(0, 160) : error}`,
      );
      continue;
    }
    if (row.skipped) {
      console.log(`${doc.sourceId}: skipped (${row.skipReason ?? "dedup"})`);
    } else {
      console.log(
        `${doc.sourceId}: entities +${row.entitiesCreated ?? 0}/${row.entitiesUpdated ?? 0} ` +
          `facts +${row.factsCreated ?? 0} invalidated ${row.factsInvalidated ?? 0} ` +
          `graph:${row.graphSynced === true ? "synced" : "PENDING"}`,
      );
    }
  }

  const graphRes = await fetch(`${API}/api/graph?groupId=default`, { headers });
  const graph = (await graphRes.json()) as { nodes?: unknown[]; links?: unknown[] };
  console.log(
    `graph totals: ${Array.isArray(graph.nodes) ? graph.nodes.length : "?"} nodes, ` +
      `${Array.isArray(graph.links) ? graph.links.length : "?"} links`,
  );
  if (failed > 0) {
    console.log(`${failed} doc(s) failed`);
    process.exit(1);
  }
}

await main();
