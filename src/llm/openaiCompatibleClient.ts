// =====================================================================
// openaiCompatibleClient.ts — OpenAI Chat Completions 兼容客户端
// 适配 juxinapi: https://api.jxincm.cn/v1/chat/completions
// 用原生 fetch，不依赖 openai SDK（避免 baseURL 拼接坑）
// =====================================================================
import { env } from "../utils/env.js";
import { safeError } from "../security/redact.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * 调用 OpenAI-compatible Chat Completions endpoint
 */
export async function callOpenAICompatible(req: ChatRequest): Promise<ChatResponse> {
  const url = `${env.OPENAI_BASE_URL}/chat/completions`;
  const timeoutMs = req.timeoutMs ?? env.DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? env.DEFAULT_TEMPERATURE,
        max_tokens: req.max_tokens ?? env.DEFAULT_MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      safeError("openai_http_error", new Error(`HTTP ${response.status}: ${errBody.slice(0, 500)}`));
      throw new Error(`OpenAI-compatible API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: ChatResponse["usage"];
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new Error("OpenAI-compatible API returned empty content");
    }

    return {
      content,
      model: data.model ?? req.model,
      usage: data.usage,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`OpenAI-compatible request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}