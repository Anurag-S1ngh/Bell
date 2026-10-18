/**
 * Embedding utilities. Supports OpenAI text-embedding-3-large and
 * Gemini gemini-embedding-001, both normalized to the pgvector column
 * width of 1536 via `outputDimensionality`.
 */

import type { EmbeddingConfig } from "./types.js";
import { withLLMTimeout } from "./llm-timeout.js";

const DEFAULT_OPENAI_MODEL = "text-embedding-3-large";
const DEFAULT_GEMINI_MODEL = "gemini-embedding-001";
const DIMENSIONS = 1536;
const EMBEDDING_CONTEXT_TOKENS = 8191;
const EMBEDDING_RESERVED_TOKENS = 256;
const APPROX_CHARS_PER_TOKEN = 3.5;
const EMBEDDING_CHUNK_CHARS = Math.floor(
  (EMBEDDING_CONTEXT_TOKENS - EMBEDDING_RESERVED_TOKENS) * APPROX_CHARS_PER_TOKEN,
);
const EMBEDDING_CHUNK_OVERLAP_CHARS = Math.floor(256 * APPROX_CHARS_PER_TOKEN);

const clients: { openai?: any; gemini?: any } = {};

export function defaultEmbeddingProvider(config?: EmbeddingConfig): "openai" | "gemini" {
  if (config?.provider) return config.provider;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "openai";
}

export function defaultEmbeddingModel(
  provider: "openai" | "gemini",
  config?: EmbeddingConfig,
): string {
  if (config?.model) return config.model;
  return provider === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
}

/** The pgvector column width every provider must produce. */
export function embeddingDimensions(): number {
  return DIMENSIONS;
}

async function getOpenAIClient(config?: EmbeddingConfig) {
  if (clients.openai) return clients.openai;

  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required for openai embeddings");

  const { default: OpenAI } = await import("openai");
  clients.openai = new OpenAI({
    apiKey,
    baseURL: config?.baseURL || process.env.OPENAI_BASE_URL || undefined,
  });
  return clients.openai;
}

async function getGeminiClient(config?: EmbeddingConfig) {
  if (clients.gemini) return clients.gemini;

  const apiKey = config?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required for gemini embeddings");

  const { GoogleGenAI } = await import("@google/genai");
  clients.gemini = new GoogleGenAI({ apiKey });
  return clients.gemini;
}

function assertDimensions(
  vector: number[],
  provider: string,
  model: string,
  dimensions: number,
): number[] {
  if (vector.length !== dimensions) {
    throw new Error(
      `${provider} model "${model}" returned ${vector.length}-dim embeddings; ` +
        `the vector column expects ${dimensions}. Set output dimensions explicitly.`,
    );
  }
  return vector;
}

/**
 * The pgvector columns are fixed at DIMENSIONS. A caller asking for a
 * different width would write vectors the schema cannot store, so fail
 * fast with an actionable message instead of at insert time.
 */
function resolveDimensions(config?: EmbeddingConfig): number {
  const requested = config?.dimensions ?? DIMENSIONS;
  if (requested !== DIMENSIONS) {
    throw new Error(
      `embedding dimensions ${requested} do not match the vector column width (${DIMENSIONS}); ` +
        `migrate the pgvector schema before changing the embedding width`,
    );
  }
  return DIMENSIONS;
}

async function embedWithOpenAI(
  texts: string[],
  model: string,
  dimensions: number,
  config?: EmbeddingConfig,
): Promise<number[][]> {
  const client = await getOpenAIClient(config);
  const response = (await withLLMTimeout(
    client.embeddings.create({
      model,
      input: texts,
      dimensions,
    }),
    "embedding openai request",
  )) as { data: Array<{ embedding: number[] }> };
  return response.data.map((item) => assertDimensions(item.embedding, "openai", model, dimensions));
}

async function embedWithGemini(
  texts: string[],
  model: string,
  dimensions: number,
  config?: EmbeddingConfig,
): Promise<number[][]> {
  const ai = await getGeminiClient(config);
  const response = (await withLLMTimeout(
    ai.models.embedContent({
      model,
      contents: texts,
      config: { outputDimensionality: dimensions },
    }),
    "embedding gemini request",
  )) as { embeddings?: Array<{ values?: number[] }> };
  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(
      `gemini model "${model}" returned ${embeddings.length} embeddings for ${texts.length} inputs`,
    );
  }
  return embeddings.map((item) => assertDimensions(item.values ?? [], "gemini", model, dimensions));
}

export async function embed(text: string, config?: EmbeddingConfig): Promise<number[]> {
  const [embedding] = await embedBatch([text], config);
  return embedding;
}

export async function embedBatch(texts: string[], config?: EmbeddingConfig): Promise<number[][]> {
  const provider = defaultEmbeddingProvider(config);
  const model = defaultEmbeddingModel(provider, config);
  const dimensions = resolveDimensions(config);

  const chunkRequests: { text: string; sourceIndex: number; weight: number }[] = [];
  for (let sourceIndex = 0; sourceIndex < texts.length; sourceIndex += 1) {
    const chunks = chunkForEmbedding(texts[sourceIndex]);
    for (const chunk of chunks) {
      chunkRequests.push({ text: chunk, sourceIndex, weight: Math.max(1, chunk.length) });
    }
  }

  const chunkEmbeddings: { embedding: number[]; sourceIndex: number; weight: number }[] = [];
  for (let i = 0; i < chunkRequests.length; i += 2048) {
    const batch = chunkRequests.slice(i, i + 2048);
    const vectors =
      provider === "gemini"
        ? await embedWithGemini(
            batch.map((item) => item.text),
            model,
            dimensions,
            config,
          )
        : await embedWithOpenAI(
            batch.map((item) => item.text),
            model,
            dimensions,
            config,
          );
    for (let j = 0; j < vectors.length; j += 1) {
      chunkEmbeddings.push({
        embedding: vectors[j],
        sourceIndex: batch[j].sourceIndex,
        weight: batch[j].weight,
      });
    }
  }

  return texts.map((_, sourceIndex) =>
    weightedAverage(chunkEmbeddings.filter((item) => item.sourceIndex === sourceIndex)),
  );
}

function chunkForEmbedding(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [""];
  if (normalized.length <= EMBEDDING_CHUNK_CHARS) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + EMBEDDING_CHUNK_CHARS);
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) break;
    start = end - EMBEDDING_CHUNK_OVERLAP_CHARS;
  }
  return chunks;
}

function weightedAverage(items: { embedding: number[]; weight: number }[]): number[] {
  if (items.length === 0) return Array.from({ length: DIMENSIONS }, () => 0);
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const output = Array.from({ length: items[0].embedding.length }, () => 0);
  for (const item of items) {
    const weight = item.weight / totalWeight;
    for (let i = 0; i < item.embedding.length; i += 1) {
      output[i] += item.embedding[i] * weight;
    }
  }
  return output;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
