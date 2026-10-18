/**
 * Provider-agnostic LLM dispatch across Anthropic, OpenAI, and Gemini.
 *
 * Every provider is called the same way — a system instruction plus a user
 * prompt — and returns raw text. Call sites keep their own parsing, so
 * extraction, triage, synthesis, routing, and memory all share one path
 * and behave identically regardless of the configured provider.
 */

import type { LLMConfig } from "./types.js";
import {
  anthropicMaxOutputTokens,
  defaultLLMModel,
  defaultLLMProvider,
  modelMaxOutputTokens,
} from "./llm-limits.js";
import { withLLMTimeout } from "./llm-timeout.js";

export interface LLMTextRequest {
  /** System instruction. Omit for prompt-only calls. */
  system?: string;
  user: string;
  config?: LLMConfig;
  /** Human-readable prefix used in timeout errors, e.g. "extraction". */
  label: string;
  /** Request provider-native JSON output where the provider supports it. */
  json?: boolean;
}

/** True when a usable LLM credential is available from config or the environment. */
export function hasLLMKey(config?: LLMConfig): boolean {
  return Boolean(
    config?.apiKey ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY,
  );
}

export async function callLLMText({
  system,
  user,
  config,
  label,
  json = false,
}: LLMTextRequest): Promise<string> {
  const provider = defaultLLMProvider(config);

  if (provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: config?.apiKey || process.env.ANTHROPIC_API_KEY });
    const response = await withLLMTimeout(
      client.messages.create({
        model: defaultLLMModel("anthropic", config),
        max_tokens: anthropicMaxOutputTokens(config),
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: user }],
      }),
      `${label} anthropic request`,
    );
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock?.text ?? "";
  }

  if (provider === "gemini") {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: config?.apiKey || process.env.GEMINI_API_KEY });
    const model = defaultLLMModel("gemini", config);
    const response = await withLLMTimeout(
      ai.models.generateContent({
        model,
        contents: user,
        config: {
          ...(system ? { systemInstruction: system } : {}),
          maxOutputTokens: config?.maxOutputTokens ?? modelMaxOutputTokens(model),
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      `${label} gemini request`,
    );
    return response.text ?? "";
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
    baseURL: config?.baseURL || process.env.OPENAI_BASE_URL || undefined,
  });
  const response = await withLLMTimeout(
    client.chat.completions.create({
      model: defaultLLMModel("openai", config),
      max_tokens: config?.maxOutputTokens ?? 2048,
      ...(json ? { response_format: { type: "json_object" as const } } : {}),
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: user },
      ],
    }),
    `${label} openai request`,
  );
  return response.choices[0]?.message?.content ?? "";
}
