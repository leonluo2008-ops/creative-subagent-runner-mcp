// =====================================================================
// redact.ts — 日志/错误脱敏
// 禁止在任何日志、错误堆栈、响应体中打印:
//   - OPENAI_API_KEY
//   - GEMINI_API_KEY
//   - MCP_AUTH_TOKEN
// =====================================================================

const SENSITIVE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // Bearer Token (任何 sk- 开头的 Key)
  {
    name: "bearer_key",
    regex: /(Bearer\s+)([A-Za-z0-9_\-]{10,})/g,
  },
  // sk-xxxx 这种 juxinapi / openai 风格 Key
  {
    name: "sk_key",
    regex: /(sk-[A-Za-z0-9_\-]{10,})/g,
  },
  // Query string 里的 key= 参数
  {
    name: "query_key",
    regex: /([?&]key=)([A-Za-z0-9_\-]{10,})/g,
  },
];

export function redactString(input: string): string {
  let result = input;
  for (const { regex } of SENSITIVE_PATTERNS) {
    result = result.replace(regex, (_match, prefix) => {
      return `${prefix}[REDACTED]`;
    });
  }
  return result;
}

export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactString(obj) as unknown as T;
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactObject(v)) as unknown as T;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // 直接命中敏感字段名 → 整体替换
      if (/KEY|TOKEN|SECRET|PASSWORD/i.test(k)) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = redactObject(v);
      }
    }
    return result as unknown as T;
  }
  return obj;
}

/**
 * 安全日志函数：自动脱敏
 */
export function safeLog(...args: unknown[]) {
  const redacted = args.map((a) => redactObject(a));
  console.log(...redacted);
}

/**
 * 安全错误日志：自动脱敏 + 截断长堆栈
 */
export function safeError(label: string, err: unknown) {
  const errStr = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  const truncated = errStr.length > 2000 ? errStr.slice(0, 2000) + "\n...[truncated]" : errStr;
  console.error(`[${label}]`, redactString(truncated));
}