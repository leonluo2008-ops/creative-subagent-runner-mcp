// =====================================================================
// geminiNativeClient.ts — Gemini 原生 generateContent 客户端
// 适配 juxinapi: https://api.jxincm.cn/v1beta/models/{model}:generateContent
// 支持 Bearer / query key / both 三种鉴权模式
// =====================================================================
import { safeError } from "../security/redact.js";

export interface GeminiRequest {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface GeminiRuntime {
  baseUrl: string;
  apiKey: string;
  authMode: "bearer" | "key_query" | "both";
  defaultTemperature: number;
  defaultMaxTokens: number;
  defaultTimeoutMs: number;
}

export interface GeminiResponse {
  content: string;
  model: string;
  usage?: {
    prompt_token_count?: number;
    candidates_token_count?: number;
    total_token_count?: number;
  };
}

/**
 * 构造两种 URL: Bearer 模式 / query key 模式
 */
function buildUrls(runtime: GeminiRuntime, model: string): { bearerUrl: string; keyQueryUrl: string } {
  const base = `${runtime.baseUrl}/v1beta/models/${model}:generateContent`;
  return {
    bearerUrl: base,
    keyQueryUrl: `${base}?key=${encodeURIComponent(runtime.apiKey)}`,
  };
}

/**
 * 构造 Gemini 原生请求体
 * Gemini 没有 system role 字段，惯例是把 system prompt 拼到 user prompt 头部
 */
function buildBody(req: GeminiRequest, runtime: GeminiRuntime) {
  const userText = req.systemPrompt
    ? `[SYSTEM]\n${req.systemPrompt}\n\n[USER]\n${req.userPrompt}`
    : req.userPrompt;

  return {
    contents: [
      {
        role: "user",
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      temperature: req.temperature ?? runtime.defaultTemperature,
      maxOutputTokens: req.maxOutputTokens ?? runtime.defaultMaxTokens,
    },
  };
}

/**
 * 尝试一种鉴权方式，返回响应 + 是否成功
 */
async function tryAuth(
  runtime: GeminiRuntime,
  url: string,
  useBearer: boolean,
  body: object,
  timeoutMs: number
): Promise<{ ok: true; data: GeminiRawResponse } | { ok: false; status: number; reason: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (useBearer) {
      headers.Authorization = `Bearer ${runtime.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        ok: false,
        status: response.status,
        reason: `HTTP ${response.status}: ${errBody.slice(0, 300)}`,
      };
    }

    const data = (await response.json()) as GeminiRawResponse;
    return { ok: true, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 0, reason: `timeout after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      status: 0,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

interface GeminiRawResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  modelVersion?: string;
  usageMetadata?: GeminiResponse["usage"];
}

/**
 * 调用 Gemini 原生 endpoint
 * 根据 GEMINI_AUTH_MODE 自动选择鉴权模式
 */
export async function callGeminiNative(
  req: GeminiRequest,
  runtime: GeminiRuntime,
): Promise<GeminiResponse> {
  const { bearerUrl, keyQueryUrl } = buildUrls(runtime, req.model);
  const body = buildBody(req, runtime);
  const timeoutMs = req.timeoutMs ?? runtime.defaultTimeoutMs;

  const modes = runtime.authMode;
  const attempts: Array<{ url: string; useBearer: boolean; label: string }> = [];

  if (modes === "bearer" || modes === "both") {
    attempts.push({ url: bearerUrl, useBearer: true, label: "bearer" });
  }
  if (modes === "key_query" || modes === "both") {
    attempts.push({ url: keyQueryUrl, useBearer: false, label: "key_query" });
  }

  if (attempts.length === 0) {
    throw new Error("No Gemini auth mode configured");
  }

  let lastError = "";

  for (const attempt of attempts) {
    const result = await tryAuth(runtime, attempt.url, attempt.useBearer, body, timeoutMs);
    if (result.ok) {
      const text = result.data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      if (!text) {
        throw new Error("Gemini API returned empty content");
      }
      return {
        content: text,
        model: result.data.modelVersion ?? req.model,
        usage: result.data.usageMetadata,
      };
    }
    lastError = `[${attempt.label}] ${result.reason}`;
    safeError("gemini_attempt_failed", new Error(lastError));
  }

  throw new Error(`All Gemini auth attempts failed. Last: ${lastError}`);
}
