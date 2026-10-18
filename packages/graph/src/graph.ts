import { FalkorDBClient } from "./client";

function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function num(value: number): string {
  return String(Math.trunc(value));
}

export class FalkorGraph {
  constructor(
    private readonly client: FalkorDBClient,
    public readonly name: string = "bell",
  ) {}

  async initialize(): Promise<void> {
    await this.client.query(this.name, "RETURN 1");
  }

  async query(cypher: string): Promise<unknown> {
    return this.client.query(this.name, cypher);
  }

  async upsertEntity(input: {
    id: string;
    groupId: string;
    entityType: string;
    name: string;
    summary?: string;
    /** Visibility gate for graph reads. Defaults to true (visible). */
    isPublic?: boolean;
  }): Promise<void> {
    const visibility = input.isPublic === false ? "false" : "true";
    const cypher = [
      "MERGE (e:Entity {id: '" + esc(input.id) + "', groupId: '" + esc(input.groupId) + "'})",
      "ON CREATE SET e.entityType = '" +
        esc(input.entityType) +
        "', e.name = '" +
        esc(input.name) +
        "',",
      "  e.summary = '" +
        esc(input.summary ?? "") +
        "', e.isPublic = " +
        visibility +
        ", e.createdAt = timestamp()",
      "ON MATCH SET e.name = '" +
        esc(input.name) +
        "', e.summary = '" +
        esc(input.summary ?? "") +
        "',",
      "  e.isPublic = " + visibility + ", e.updatedAt = timestamp()",
      "RETURN e.id",
    ].join(" ");
    await this.client.query(this.name, cypher);
  }

  async upsertFact(input: {
    id: string;
    groupId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relation: string;
    factText: string;
    confidence?: number;
    validAtMs?: number;
    invalidAtMs?: number;
    sourceEpisodeId?: string;
    /** Visibility gate for graph reads. Defaults to true (visible). */
    isPublic?: boolean;
  }): Promise<void> {
    const validAt = input.validAtMs ?? Date.now();
    const visibility = input.isPublic === false ? "false" : "true";
    const parts = [
      "MATCH (a:Entity {id: '" +
        esc(input.sourceEntityId) +
        "'}), (b:Entity {id: '" +
        esc(input.targetEntityId) +
        "'})",
      "MERGE (a)-[f:FACT {id: '" + esc(input.id) + "'}]->(b)",
      "SET f.groupId = '" + esc(input.groupId) + "',",
      "    f.isPublic = " + visibility + ",",
      "    f.relation = '" + esc(input.relation) + "',",
      "    f.factText = '" + esc(input.factText) + "',",
      "    f.confidence = " + String(input.confidence ?? 1) + ",",
      "    f.validAt = " + num(validAt),
      input.invalidAtMs ? ",    f.invalidAt = " + num(input.invalidAtMs) : "",
      input.sourceEpisodeId ? ",    f.sourceEpisodeId = '" + esc(input.sourceEpisodeId) + "'" : "",
      "RETURN f.id",
    ];
    await this.client.query(this.name, parts.filter(Boolean).join(" "));
  }

  async invalidateFacts(input: {
    groupId: string;
    sourceEntityId: string;
    relation: string;
    exceptId?: string;
  }): Promise<void> {
    const except = input.exceptId ? " AND f.id <> '" + esc(input.exceptId) + "'" : "";
    const cypher = [
      "MATCH (a:Entity {id: '" + esc(input.sourceEntityId) + "'})-[f:FACT]->()",
      "WHERE f.groupId = '" +
        esc(input.groupId) +
        "' AND f.relation = '" +
        esc(input.relation) +
        "'" +
        except,
      "SET f.invalidAt = timestamp()",
      "RETURN count(f)",
    ].join(" ");
    await this.client.query(this.name, cypher);
  }

  async setFactInvalidAt(input: { id: string; invalidAtMs?: number }): Promise<void> {
    const stamp = input.invalidAtMs !== undefined ? String(num(input.invalidAtMs)) : "timestamp()";
    await this.client.query(
      this.name,
      "MATCH (a)-[f:FACT {id: '" +
        esc(input.id) +
        "'}]->() SET f.invalidAt = " +
        stamp +
        " RETURN f.id",
    );
  }

  async traverse(
    seedIds: string[],
    maxHops = 3,
    decay = 0.9,
  ): Promise<Array<{ source: string; target: string; hops: number; score: number }>> {
    if (seedIds.length === 0) return [];
    const seeds = seedIds.map((id) => "'" + esc(id) + "'").join(", ");
    const cypher = [
      "MATCH p=(s:Entity)-[r:FACT*1.." + num(maxHops) + "]->(t:Entity)",
      "WHERE s.id IN [" + seeds + "]",
      "RETURN s.id AS source, t.id AS target, length(p) AS hops",
    ].join(" ");
    const result = await this.client.query(this.name, cypher);
    const rows =
      Array.isArray(result) && Array.isArray(result[1]) ? (result[1] as unknown[][]) : [];
    return rows.map((row) => {
      const hops = Number(row[2] ?? 1);
      return {
        source: String(row[0]),
        target: String(row[1]),
        hops,
        score: Math.pow(decay, hops),
      };
    });
  }

  async timeline(entityId: string): Promise<Array<Record<string, unknown>>> {
    const cypher = [
      "MATCH (s:Entity)-[f:FACT]->(t:Entity)",
      "WHERE s.id = '" + esc(entityId) + "' OR t.id = '" + esc(entityId) + "'",
      "RETURN s.id, t.id, f.id, f.relation, f.factText, f.validAt, f.invalidAt, f.confidence",
      "ORDER BY f.validAt",
    ].join(" ");
    const result = await this.client.query(this.name, cypher);
    const rows =
      Array.isArray(result) && Array.isArray(result[1]) ? (result[1] as unknown[][]) : [];
    return rows.map((row) => ({
      source: row[0],
      target: row[1],
      factId: row[2],
      relation: row[3],
      factText: row[4],
      validAt: row[5],
      invalidAt: row[6],
      confidence: row[7],
    }));
  }

  async changedSince(sinceMs: number): Promise<Array<Record<string, unknown>>> {
    const cypher = [
      "MATCH ()-[f:FACT]->()",
      "WHERE f.validAt >= " +
        num(sinceMs) +
        " OR (f.invalidAt IS NOT NULL AND f.invalidAt >= " +
        num(sinceMs) +
        ")",
      "RETURN f.id, f.groupId, f.relation, f.factText, f.validAt, f.invalidAt",
      "ORDER BY f.validAt",
    ].join(" ");
    const result = await this.client.query(this.name, cypher);
    const rows =
      Array.isArray(result) && Array.isArray(result[1]) ? (result[1] as unknown[][]) : [];
    return rows.map((row) => ({
      factId: row[0],
      groupId: row[1],
      relation: row[2],
      factText: row[3],
      validAt: row[4],
      invalidAt: row[5],
    }));
  }

  async contradictions(limit = 25): Promise<Array<Record<string, unknown>>> {
    const cypher = [
      "MATCH (s:Entity)-[f:FACT]->(t:Entity)",
      "WHERE f.invalidAt IS NOT NULL",
      "RETURN s.id, t.id, f.relation, f.factText, f.validAt, f.invalidAt",
      "ORDER BY f.invalidAt DESC",
      "LIMIT " + num(limit),
    ].join(" ");
    const result = await this.client.query(this.name, cypher);
    const rows =
      Array.isArray(result) && Array.isArray(result[1]) ? (result[1] as unknown[][]) : [];
    return rows.map((row) => ({
      source: row[0],
      target: row[1],
      relation: row[2],
      factText: row[3],
      validAt: row[4],
      invalidAt: row[5],
    }));
  }

  async neighbors(
    entityId: string,
  ): Promise<Array<{ id: string; relation: string; direction: "out" | "in" }>> {
    const outgoing = await this.client.query(
      this.name,
      "MATCH (s:Entity {id: '" + esc(entityId) + "'})-[f:FACT]->(t:Entity) RETURN t.id, f.relation",
    );
    const incoming = await this.client.query(
      this.name,
      "MATCH (s:Entity)-[f:FACT]->(t:Entity {id: '" + esc(entityId) + "'}) RETURN s.id, f.relation",
    );
    const outRows =
      Array.isArray(outgoing) && Array.isArray(outgoing[1]) ? (outgoing[1] as unknown[][]) : [];
    const inRows =
      Array.isArray(incoming) && Array.isArray(incoming[1]) ? (incoming[1] as unknown[][]) : [];
    return [
      ...outRows.map((row) => ({
        id: String(row[0]),
        relation: String(row[1]),
        direction: "out" as const,
      })),
      ...inRows.map((row) => ({
        id: String(row[0]),
        relation: String(row[1]),
        direction: "in" as const,
      })),
    ];
  }

  async adjacency(): Promise<Map<string, string[]>> {
    const result = await this.client.query(
      this.name,
      "MATCH (a:Entity)-[:FACT]->(b:Entity) RETURN a.id, b.id",
    );
    const rows =
      Array.isArray(result) && Array.isArray(result[1]) ? (result[1] as unknown[][]) : [];
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const source = String(row[0]);
      const target = String(row[1]);
      const current = map.get(source) ?? [];
      current.push(target);
      map.set(source, current);
    }
    return map;
  }

  async pageRank(iterations = 20, damping = 0.85): Promise<Map<string, number>> {
    const adjacency = await this.adjacency();
    const nodes = new Set<string>();
    for (const [source, targets] of adjacency) {
      nodes.add(source);
      for (const target of targets) nodes.add(target);
    }
    const ids = [...nodes];
    const rank = new Map(ids.map((id) => [id, 1 / Math.max(1, ids.length)]));
    const outDegree = new Map(ids.map((id) => [id, Math.max(1, (adjacency.get(id) ?? []).length)]));
    for (let i = 0; i < iterations; i += 1) {
      const next = new Map(ids.map((id) => [id, (1 - damping) / Math.max(1, ids.length)]));
      for (const source of ids) {
        const targets = adjacency.get(source) ?? [];
        const contribution = (rank.get(source) ?? 0) / (outDegree.get(source) ?? 1);
        for (const target of targets) {
          next.set(target, (next.get(target) ?? 0) + damping * contribution);
        }
      }
      for (const id of ids) rank.set(id, next.get(id) ?? 0);
    }
    return rank;
  }

  async toVisData(groupId: string): Promise<{
    nodes: Array<{ id: string; label: string; group: string }>;
    links: Array<{ source: string; target: string; relation: string }>;
  }> {
    const nodeResult = await this.client.query(
      this.name,
      "MATCH (n:Entity) WHERE n.groupId = '" +
        esc(groupId) +
        "' AND coalesce(n.isPublic, true) RETURN n.id, n.name, n.entityType",
    );
    const edgeResult = await this.client.query(
      this.name,
      "MATCH (a:Entity)-[r:FACT]->(b:Entity) WHERE r.groupId = '" +
        esc(groupId) +
        "' AND r.invalidAt IS NULL AND coalesce(r.isPublic, true) RETURN a.id, b.id, r.relation",
    );
    const nodeRows =
      Array.isArray(nodeResult) && Array.isArray(nodeResult[1])
        ? (nodeResult[1] as unknown[][])
        : [];
    const edgeRows =
      Array.isArray(edgeResult) && Array.isArray(edgeResult[1])
        ? (edgeResult[1] as unknown[][])
        : [];
    return {
      nodes: nodeRows.map((row) => ({
        id: String(row[0]),
        label: String(row[1] ?? row[0]),
        group: String(row[2] ?? "entity"),
      })),
      links: edgeRows.map((row) => ({
        source: String(row[0]),
        target: String(row[1]),
        relation: String(row[2]),
      })),
    };
  }
}

export { FalkorDBClient } from "./client";
export type { FalkorDBConfig } from "./client";
