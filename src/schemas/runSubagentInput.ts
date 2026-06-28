// =====================================================================
// schemas/runSubagentInput.ts — 输入校验 + missing_context 检测
// =====================================================================
import { z } from "zod";
import type { Role } from "../llm/modelRouter.js";
import type { ActiveConfigSnapshot } from "../store/types.js";

// ---- 公共子 schema ----
const ProjectContextSchema = z.object({
  project_name: z.string().optional(),
  genre: z.string().optional(),
  target_reader: z.string().optional(),
  l1_core: z.string().optional().default(""),
  l0_world: z.string().optional().default(""),
  series_l2: z.string().optional().default(""),
  current_season_l2: z.string().optional().default(""),
  project_rules: z.array(z.string()).optional().default([]),
  forbidden: z.array(z.string()).optional().default([]),
});

const ChapterContextSchema = z.object({
  season: z.number().int().optional(),
  chapter: z.number().int().optional(),
  chapter_title: z.string().optional().default(""),
  chapter_beats: z.string().optional().default(""),
  previous_chapter_tail: z.string().optional().default(""),
  next_chapter_hook: z.string().optional().default(""),
  existing_draft: z.string().optional().default(""),
  previous_audit: z.string().optional().default(""),
});

const StyleRulesSchema = z.object({
  tone: z.string().optional().default(""),
  narration: z.string().optional().default(""),
  must_have: z.array(z.string()).optional().default([]),
  anti_patterns: z.array(z.string()).optional().default([]),
});

const OutputContractSchema = z.object({
  format: z.enum(["markdown", "plain"]).optional().default("markdown"),
  word_count: z.string().optional().default(""),
  language: z.string().optional().default("zh-CN"),
  return_json: z.boolean().optional().default(false),
});

const ModelOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().optional(),
});

// ---- 顶层 schema ----
export const RunSubagentInputSchema = z.object({
  role: z.enum(["chapter_writer", "structure_auditor", "style_auditor", "reviser"]),
  task_id: z.string().min(1),
  provider: z.enum(["openai", "gemini"]).optional(),
  model: z.string().optional(),
  project_context: ProjectContextSchema.optional(),
  chapter_context: ChapterContextSchema.optional(),
  style_rules: StyleRulesSchema.optional(),
  output_contract: OutputContractSchema.optional(),
  model_options: ModelOptionsSchema.optional(),
});

export type RunSubagentInput = z.infer<typeof RunSubagentInputSchema>;

// ---- 校验结果 ----
export type ValidationResult =
  | { ok: true; data: RunSubagentInput }
  | { ok: false; status: "missing_context" | "input_too_large" | "invalid_input"; missing?: string[]; message: string };

/**
 * 校验 + 角色必填检查 + 输入大小限制
 */
export function validateRunSubagentInput(raw: unknown, snapshot: ActiveConfigSnapshot): ValidationResult {
  // 1. 顶层 schema
  const parsed = RunSubagentInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: "invalid_input",
      message: "Input failed schema validation: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }

  const data = parsed.data;

  // 2. 输入大小限制
  const serialized = JSON.stringify(data);
  if (serialized.length > snapshot.runtime.maxInputChars) {
    return {
      ok: false,
      status: "input_too_large",
      message: `Input size ${serialized.length} chars exceeds MAX_INPUT_CHARS=${snapshot.runtime.maxInputChars}.`,
    };
  }

  // 3. 角色必填字段检查
  const roleDef = snapshot.roles.find((role) => role.role === data.role && role.enabled);
  if (!roleDef) {
    return {
      ok: false,
      status: "invalid_input",
      message: `Role '${data.role}' is disabled or missing from active config.`,
    };
  }
  const missing: string[] = [];

  for (const fieldPath of roleDef.requiredInputFields) {
    if (!hasValueAt(data, fieldPath)) {
      missing.push(fieldPath);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      status: "missing_context",
      missing,
      message: `缺少关键上下文，不能运行 ${data.role}。缺失字段: ${missing.join(", ")}`,
    };
  }

  return { ok: true, data };
}

/**
 * 检查嵌套路径是否有有效值
 * 支持路径: "project_context.l1_core" / "style_rules.tone" / "chapter_context.chapter_beats"
 */
function hasValueAt(obj: unknown, path: string): boolean {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === undefined || cur === null) return false;
  if (typeof cur === "string") return cur.trim().length > 0;
  if (Array.isArray(cur)) return cur.length > 0;
  if (typeof cur === "object") return Object.keys(cur as object).length > 0;
  return true;
}
