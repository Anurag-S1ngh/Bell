import { ENV } from "./env.server";
import { createDb } from "@Bell/db";
import { FalkorDBClient, FalkorGraph } from "@Bell/graph";
import { KnowledgeEngine } from "@Bell/knowledge";

export const db = createDb(ENV);

export const falkorClient = new FalkorDBClient({
  url: ENV.FALKORDB_URL,
});
export const falkor = new FalkorGraph(falkorClient, ENV.BELL_GROUP_ID);

const openAIBaseURL = ENV.OPENAI_BASE_URL || undefined;
const llmModel = ENV.LLM_MODEL || "gpt-4o-mini";
const embeddingModel = ENV.EMBEDDING_MODEL || "text-embedding-3-large";

const llm = ENV.OPENAI_API_KEY
  ? {
      provider: "openai" as const,
      apiKey: ENV.OPENAI_API_KEY,
      model: llmModel,
      ...(openAIBaseURL ? { baseURL: openAIBaseURL } : {}),
    }
  : ENV.ANTHROPIC_API_KEY
    ? { provider: "anthropic" as const, apiKey: ENV.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" }
    : ENV.GEMINI_API_KEY
      ? { provider: "gemini" as const, apiKey: ENV.GEMINI_API_KEY, model: "gemini-2.5-flash" }
      : undefined;

const embedding = ENV.OPENAI_API_KEY
  ? {
      provider: "openai" as const,
      apiKey: ENV.OPENAI_API_KEY,
      model: embeddingModel,
      ...(openAIBaseURL ? { baseURL: openAIBaseURL } : {}),
    }
  : ENV.GEMINI_API_KEY
    ? { provider: "gemini" as const, apiKey: ENV.GEMINI_API_KEY, model: "gemini-embedding-001" }
    : undefined;

export const knowledge = new KnowledgeEngine({
  database: ENV.DATABASE_URL,
  defaultGroupId: ENV.BELL_GROUP_ID,
  embedding,
  llm,
  graph: falkor,
});

export async function initServices(): Promise<void> {
  await knowledge.init();
  await falkorClient.connect();
  await falkor.initialize();
  console.log("FALKOR_INITIALIZED");
}
