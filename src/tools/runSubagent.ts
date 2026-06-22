// =====================================================================
// tools/runSubagent.ts — 核心：调 LLM 跑子 agent
// 流程: validate → resolveRoute → call LLM → normalize → return
// =====================================================================
import { env } from "../utils/env.js";
import { safeError, safeLog } from "../security/redact.js";
import { resolveRoute, getFallbackModelForRole, type Role } from "../llm/modelRouter.js";
import { callOpenAICompatible } from "../llm/openaiCompatibleClient.js";
import { callGeminiNative } from "../llm/geminiNativeClient.js";
import { getRoleDefinition } from "../roles/index.js";
import { validateRunSubagentInput } from "../schemas/runSubagentInput.js";

export interface RunSubagentResult {
  status: "ok" | "missing_context" | "input_too_large" | "invalid_input" | "provider_role_mismatch" | "timeout" | "model_error" | "unknown_role";
  role: Role;
  task_id: string;
  provider?: string;
  model?: string;
  content?: string;        // 写手 / 修稿 的正文
  report?: object;          // 审计员的 JSON 报告
  error?: {
    missing?: string[];
    message: string;
    requested_provider?: string;
    requested_model?: string;
    expected_provider?: string;
    expected_model?: string;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    thoughts_tokens?: number;
  };
  elapsed_ms: number;
}

/**
 * 构造 LLM 输入的 user prompt
 * 把 project_context / chapter_context / style_rules / output_contract 拼成一段
 * 清晰的 "任务上下文" 给模型看
 */
function buildUserPrompt(input: import("../schemas/runSubagentInput.js").RunSubagentInput): string {
  const sections: string[] = [];

  // 1. 任务身份
  sections.push(`# 任务身份
- 任务 ID: ${input.task_id}
- 角色: ${input.role}
- 目标语言: ${input.output_contract?.language ?? "zh-CN"}
- 输出格式: ${input.output_contract?.format ?? "markdown"}
${input.output_contract?.word_count ? `- 字数要求: ${input.output_contract.word_count}` : ""}`);

  // 2. 项目上下文（所有角色通用）
  if (input.project_context) {
    const pc = input.project_context;
    sections.push(`# 项目上下文
- 项目名: ${pc.project_name ?? "(未提供)"}
- 类型: ${pc.genre ?? "(未提供)"}
- 目标读者: ${pc.target_reader ?? "(未提供)"}

## L1 核心（One-liner）
${pc.l1_core || "(空)"}

## L0 世界观
${pc.l0_world || "(空)"}

## series_L2
${pc.series_l2 || "(空)"}

## current_season_L2
${pc.current_season_l2 || "(空)"}

${pc.project_rules && pc.project_rules.length > 0 ? `## 项目规则\n${pc.project_rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : ""}
${pc.forbidden && pc.forbidden.length > 0 ? `## 项目禁区\n${pc.forbidden.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : ""}`);
  }

  // 3. 章节上下文
  if (input.chapter_context) {
    const cc = input.chapter_context;
    sections.push(`# 章节上下文
- 季: ${cc.season ?? "(未提供)"}
- 章: ${cc.chapter ?? "(未提供)"}
- 章节标题: ${cc.chapter_title || "(未提供)"}

## 章节 beats（必须完成的事项）
${cc.chapter_beats || "(空)"}

${cc.previous_chapter_tail ? `## 上一章结尾（必须承接）\n${cc.previous_chapter_tail}` : ""}
${cc.next_chapter_hook ? `## 下一章钩子（必须预留）\n${cc.next_chapter_hook}` : ""}
${cc.existing_draft ? `## 现有正文（审计/修稿时使用）\n${cc.existing_draft}` : ""}
${cc.previous_audit ? `## 上一轮审计报告（修稿时使用）\n${cc.previous_audit}` : ""}`);
  }

  // 4. 风格规则
  if (input.style_rules) {
    const sr = input.style_rules;
    sections.push(`# 风格规则
- 语气: ${sr.tone || "(未指定)"}
- 叙事人称: ${sr.narration || "(未指定)"}

${sr.must_have && sr.must_have.length > 0 ? `## 必须有\n${sr.must_have.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : ""}
${sr.anti_patterns && sr.anti_patterns.length > 0 ? `## 反模式（禁止）\n${sr.anti_patterns.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : ""}`);
  }

  return sections.join("\n\n");
}

/**
 * 尝试从 LLM 输出里提取 JSON
 * 审计员的 prompt 要求返回 JSON，但模型可能前后包了 ```json ``` 或多余文字
 */
function tryExtractJson(text: string): object | null {
  // 1. 直接 parse
  try {
    return JSON.parse(text);
  } catch {
    // ignore
  }
  // 2. 提取 ```json ... ``` 块
  const m = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) {
    try {
      return JSON.parse(m[1].trim());
    } catch {
      // ignore
    }
  }
  // 3. 提取首个 { ... } 块
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * 主入口
 */
export async function runSubagent(rawInput: unknown): Promise<RunSubagentResult> {
  const t0 = Date.now();

  // 1. 校验输入
  const validation = validateRunSubagentInput(rawInput);
  if (!validation.ok) {
    return {
      status: validation.status,
      role: (rawInput as { role?: Role })?.role ?? "chapter_writer",
      task_id: (rawInput as { task_id?: string })?.task_id ?? "unknown",
      error: {
        missing: validation.missing,
        message: validation.message,
      },
      elapsed_ms: Date.now() - t0,
    };
  }

  const input = validation.data;
  const roleDef = getRoleDefinition(input.role);

  // 2. 解析路由（含 provider_role_mismatch 校验）
  const routeResult = resolveRoute(input.role, input.provider, input.model);
  if (!routeResult.ok) {
    safeError("route_mismatch", new Error(routeResult.error.message));
    return {
      status: "provider_role_mismatch",
      role: input.role,
      task_id: input.task_id,
      error: {
        message: routeResult.error.message,
        requested_provider: routeResult.error.requestedProvider,
        requested_model: routeResult.error.requestedModel,
        expected_provider: routeResult.error.expectedProvider,
        expected_model: routeResult.error.expectedModel,
      },
      elapsed_ms: Date.now() - t0,
    };
  }

  const route = routeResult.route;
  safeLog(`[run_subagent] role=${route.role} provider=${route.provider} model=${route.model} task_id=${input.task_id}`);

  // 3. 构造 prompt
  const systemPrompt = roleDef.systemPrompt;
  const userPrompt = buildUserPrompt(input);

  // 4. 调 LLM
  const modelOptions = input.model_options ?? {};
  const temperature = modelOptions.temperature ?? env.DEFAULT_TEMPERATURE;
  const maxTokens = modelOptions.max_tokens ?? env.DEFAULT_MAX_TOKENS;
  const timeoutMs = modelOptions.timeout_ms ?? env.DEFAULT_TIMEOUT_MS;

  try {
    let content = "";
    let usage: RunSubagentResult["usage"] | undefined;

    // 调用 LLM (可能触发 fallback 重试)
    let llmResult = await callLLMWithFallback(route, systemPrompt, userPrompt, {
      temperature,
      maxTokens,
      timeoutMs,
    });

    content = llmResult.content;
    usage = llmResult.usage;

    // 5. 根据角色处理输出
    const isAuditor = input.role === "structure_auditor" || input.role === "style_auditor";

    // 实际用的 model (如果 fallback 了, 这里用 fallback model)
    const actualModel = llmResult.usedFallback
      ? getFallbackModelForRole(input.role, route.provider as "openai" | "gemini") ?? route.model
      : route.model;

    if (isAuditor) {
      const report = tryExtractJson(content);
      return {
        status: "ok",
        role: input.role,
        task_id: input.task_id,
        provider: route.provider,
        model: actualModel,
        report: report ?? { raw: content, parse_error: "Could not extract JSON from model output" },
        usage,
        elapsed_ms: Date.now() - t0,
      };
    }

    // 写手 / 修稿: 直接返回 content
    return {
      status: "ok",
      role: input.role,
      task_id: input.task_id,
      provider: route.provider,
      model: actualModel,
      content,
      usage,
      elapsed_ms: Date.now() - t0,
    };
  } catch (err) {
    safeError("run_subagent_llm_error", err);
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("timed out");
    return {
      status: isTimeout ? "timeout" : "model_error",
      role: input.role,
      task_id: input.task_id,
      provider: route.provider,
      model: route.model,
      error: { message: msg },
      elapsed_ms: Date.now() - t0,
    };
  }
}

// =====================================================================
// 2026-06-22 新增: LLM 调用 + 自动 fallback retry
//
// 流程:
//   1. 用 route.model (首选) 调一次
//   2. 若失败 (非 timeout) + 有 fallback model + fallback != preferred
//      → 切 fallback 重试一次
//   3. 仍失败 → 抛错给上层 (返回 model_error)
//
// 仅 audit 角色 (structure_auditor / style_auditor) 配置了 fallback.
// chapter_writer / reviser 没有 fallback (provider=openai, 实测不限流).
// =====================================================================
async function callLLMWithFallback(
  route: { role: Role; provider: string; model: string },
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature: number; maxTokens: number; timeoutMs: number }
): Promise<{
  content: string;
  usage?: RunSubagentResult["usage"];
  usedFallback: boolean;
  fallbackReason?: string;
}> {
  // 第一次: 首选 model
  try {
    const result = await callLLMOnce(route.provider, route.model, systemPrompt, userPrompt, opts);
    return { ...result, usedFallback: false };
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    // Timeout 不触发 fallback (timeout 是网络问题, 切 model 没用)
    if (firstMsg.includes("timed out")) {
      throw firstErr;
    }
    // 检查是否有 fallback
    const fallbackModel = getFallbackModelForRole(
      route.role,
      route.provider as "openai" | "gemini"
    );
    if (!fallbackModel || fallbackModel === route.model) {
      throw firstErr; // 没 fallback 或 fallback 跟首选一样 → 直接抛
    }
    safeLog(
      `[fallback] role=${route.role} primary=${route.model} failed: ${firstMsg.slice(0, 200)} → switching to fallback=${fallbackModel}`
    );
    // 重试 fallback
    const result = await callLLMOnce(
      route.provider,
      fallbackModel,
      systemPrompt,
      userPrompt,
      opts
    );
    return {
      ...result,
      usedFallback: true,
      fallbackReason: `primary ${route.model} failed: ${firstMsg.slice(0, 200)}`,
    };
  }
}

async function callLLMOnce(
  provider: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature: number; maxTokens: number; timeoutMs: number }
): Promise<{ content: string; usage?: RunSubagentResult["usage"] }> {
  if (provider === "openai") {
    const result = await callOpenAICompatible({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs,
    });
    return {
      content: result.content,
      usage: result.usage
        ? {
            prompt_tokens: result.usage.prompt_tokens,
            completion_tokens: result.usage.completion_tokens,
            total_tokens: result.usage.total_tokens,
          }
        : undefined,
    };
  }
  if (provider === "gemini") {
    const result = await callGeminiNative({
      model,
      systemPrompt,
      userPrompt,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs,
    });
    return {
      content: result.content,
      usage: result.usage
        ? {
            prompt_tokens: result.usage.prompt_token_count,
            completion_tokens: result.usage.candidates_token_count,
            total_tokens: result.usage.total_token_count,
            thoughts_tokens: (result.usage as Record<string, number>).thoughts_token_count,
          }
        : undefined,
    };
  }
  throw new Error(`Unsupported provider: ${provider}`);
}