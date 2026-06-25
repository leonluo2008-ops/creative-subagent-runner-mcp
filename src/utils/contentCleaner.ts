// =====================================================================
// contentCleaner.ts — MCP 解析层剥 CoT + 字数校验 (v2.0.4 · 2026-06-26)
//
// 设计原则 (用户铁律):
//   - 不在 prompt 里禁 CoT / 字数约束 (LLM 行为约束不靠谱, gemini 会换说法绕过)
//   - 在 MCP 解析返回结果时剥 CoT + 校验字数 (确定性, 可测试)
//
// 处理范围:
//   - chapter_writer / reviser: 走 stripChainOfThought() + enforceWordCount()
//   - structure_auditor / style_auditor: 走 tryExtractJson(), 不剥不校验字数
//
// =====================================================================

/**
 * CoT 段落特征 (启发式)
 *
 * 触发条件 (满足任一即视为 CoT 段):
 *   - 行以 "Alright, let's" / "Okay, so" / "First, I" / "Next, I" / "Then I" / "Finally I" 开头
 *   - 行以 "The process" / "The task" / "I drafted" / "I started" / "I went" 开头
 *   - markdown 标题含 "Process" / "Review" / "Thought" / "思考" / "构思" / "整理" / "生成"
 *   - 中文元描述: "好的,现在我" / "我的任务是" / "我会" / "思路整理"
 *
 * CoT 段结束标志: 连续 2 个空行 OR 出现中文字符 (≥5 个连续中文)
 */
const COT_LINE_PATTERNS: RegExp[] = [
  /^\s*\*\*.{0,40}(Process|Review|Thought|思考|构思|整理|生成|思路).*\*\*\s*$/i,
  /^\s*(Alright|Okay),?\s+(so|let'?s|now|the)\b/i,
  /^\s*First,?\s+I\s+(need|had|will|am|started|drafted|clarified)/i,
  /^\s*Next,?\s+I\s+(need|had|will|am|started|drafted|went|checked)/i,
  /^\s*Then\s+I\s+(need|had|will|am|started|drafted|went|checked)/i,
  /^\s*Finally[,.]?\s+I\s+(need|had|will|am|started|drafted|went|checked|also)/i,
  /^\s*(I|So)\s+(drafted|started|then|finally|also|had|need|am|went|focused|expanded|double-?checked)/i,
  /^\s*The\s+(process|task|story|chapter|output)\b/i,
  /^\s*(好的|现在我|我的任务|我会|思路整理|章节构思|首先|然后我|接着我|最后我)[,，:：]?/,
];

const CHINESE_CHAR_RE = /[\u4e00-\u9fff]/g;

export interface StripResult {
  /** 清理后的文本 (剥掉 CoT) */
  cleaned: string;
  /** 是否检测到 CoT */
  hadCot: boolean;
  /** 清理掉的行数 */
  strippedLines: number;
  /** 清理后中文字符数 */
  chineseCharCount: number;
  /** 清理后总字符数 */
  totalCharCount: number;
  /** 清理后中文字符占比 (0-1) */
  chineseRatio: number;
}

/**
 * 检测一行是否 CoT
 */
function isCotLine(line: string): boolean {
  const stripped = line.trim();
  if (!stripped) return false;
  return COT_LINE_PATTERNS.some((p) => p.test(stripped));
}

/**
 * 计算中文字符数
 */
function countChineseChars(text: string): number {
  const m = text.match(CHINESE_CHAR_RE);
  return m ? m.length : 0;
}

/**
 * 主函数: 剥掉 CoT, 留下中文正文
 *
 * 策略:
 *   1. 按行扫描
 *   2. 命中 CoT pattern → 进入 CoT 模式
 *   3. CoT 模式: 跳过所有行, 直至:
 *      - 出现 ≥5 个连续中文字符 (正文开始)
 *      - 或连续 2 个空行 + 后面不是 CoT pattern (CoT 段自然结束)
 *   4. 退出 CoT 模式后, 正常保留
 */
export function stripChainOfThought(content: string): StripResult {
  const originalLines = content.split("\n");
  const cleaned: string[] = [];
  let inCot = false;
  let strippedLines = 0;
  let consecutiveEmpty = 0;

  for (let i = 0; i < originalLines.length; i++) {
    const line = originalLines[i];
    const stripped = line.trim();

    if (inCot) {
      // 退出条件 1: 出现 ≥5 个连续中文字符 (正文开始)
      const cnMatches = stripped.match(CHINESE_CHAR_RE);
      if (cnMatches && cnMatches.length >= 5 && !isCotLine(line)) {
        inCot = false;
        consecutiveEmpty = 0;
        cleaned.push(line);
        continue;
      }
      // 退出条件 2: 连续 2 个空行 + 后一行不是 CoT
      if (!stripped) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2 && i + 1 < originalLines.length) {
          const nextLine = originalLines[i + 1].trim();
          if (nextLine && !isCotLine(originalLines[i + 1])) {
            inCot = false;
            consecutiveEmpty = 0;
            // 不 push 当前空行, 保留下一行进入 cleaned
            continue;
          }
        }
        continue;
      }
      // 仍处于 CoT, 丢弃
      strippedLines++;
      continue;
    }

    // 不在 CoT, 检查是否进入
    if (isCotLine(line)) {
      inCot = true;
      strippedLines++;
      consecutiveEmpty = 0;
      continue;
    }

    // 不在 CoT 且不是 CoT, 正常保留
    consecutiveEmpty = 0;
    cleaned.push(line);
  }

  const cleanedText = cleaned.join("\n").replace(/^\s+/, "").trim();
  const chineseCharCount = countChineseChars(cleanedText);
  const totalCharCount = cleanedText.length;
  const chineseRatio = totalCharCount > 0 ? chineseCharCount / totalCharCount : 0;

  return {
    cleaned: cleanedText,
    hadCot: strippedLines > 0,
    strippedLines,
    chineseCharCount,
    totalCharCount,
    chineseRatio,
  };
}

/**
 * 决策: cleaned 是否可用?
 * - hadCot=false (本来就没 CoT) → 可用
 * - hadCot=true:
 *   - 剥后 chineseRatio >= 0.5 → 可用 (CoT 剥干净, 主体是中文正文)
 *   - 剥后 chineseRatio < 0.5 → 不可用 (剥完仍是 CoT 为主, 触发重生成)
 */
export function isCleanedUsable(result: StripResult): boolean {
  if (!result.hadCot) return true;
  return result.chineseRatio >= 0.5;
}

// =====================================================================
// v2.0.4 新增: 字数校验
//
// word_count 字段是字符串 (仓里真实定义: output_contract.word_count: string)
// 实际格式有 3 种:
//   - "1300 字" / "约 1300 字" / "1300字" (单值)
//   - "800-1500 字" / "800~1500 字" / "800 至 1500 字" (区间)
//   - "1300" (裸数字)
//
// 解析失败 → 跳过校验 (返回 null, 调用方不强制)
// =====================================================================

/**
 * 解析 word_count 字符串 → { min, max }
 * 支持格式:
 *   "1300" / "约 1300 字"        → { min: null, max: 1300 }  (只有上限)
 *   "至少 800 字"                → { min: 800, max: null }    (只有下限)
 *   "800-1500 字" / "800~1500 字" → { min: 800, max: 1500 }   (区间)
 *
 * 返回 null = 解析失败, 不强制校验
 */
export function parseWordCount(spec: string): { min: number | null; max: number | null } | null {
  if (!spec || typeof spec !== "string") return null;
  const trimmed = spec.trim();
  if (!trimmed) return null;

  // 1. 区间格式: "800-1500" / "800~1500" / "800 至 1500"
  const rangeMatch = trimmed.match(/(\d{2,5})\s*[-~至到]\s*(\d{2,5})/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1], 10);
    const b = parseInt(rangeMatch[2], 10);
    if (a > 0 && b > 0) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  // 2. 至少 N 字: "至少 800" / "不少于 800" / "≥ 800" / "min 800"
  const minMatch = trimmed.match(/(?:至少|不少于|>=|≥|min[:\s]*)\s*(\d{2,5})/i);
  if (minMatch) {
    const n = parseInt(minMatch[1], 10);
    if (n > 0) return { min: n, max: null };
  }

  // 3. 不超过 N 字: "不超过 1500" / "≤ 1500" / "max 1500" / "约 1300"
  // 先去掉 "至少/不少于/≥/min" 前缀, 防止 800 被误判成 max
  const stripped = trimmed
    .replace(/(?:至少|不少于|>=|≥|min[:\s]*)/gi, "")
    .trim();
  const maxMatch = stripped.match(/(?:不超过|<=|≤|max[:\s]*|约|大概|大约|左右)?\s*(\d{2,5})/);
  if (maxMatch) {
    const n = parseInt(maxMatch[1], 10);
    if (n > 0) return { min: null, max: n };
  }

  return null;
}

export interface WordCountCheckResult {
  /** 字数是否在范围内 */
  inRange: boolean;
  /** 实际字数 (中文字符) */
  actualCount: number;
  /** 字数下限 */
  min: number | null;
  /** 字数上限 */
  max: number | null;
  /** 误差描述 (如 "低于 min 800 差 100" / "超 max 1500 差 150") */
  diff?: string;
}

/**
 * 校验字数
 *
 * 设计:
 *   - 用中文字符数 (不是总字符数, 因为 markdown 标记/空白不影响阅读字数)
 *   - 仅在剥 CoT 之后调用, 此时 cleaned 主要是中文正文
 *
 * @param content 已剥 CoT 的内容
 * @param spec word_count 字符串 (如 "800-1500 字" / "约 1300")
 * @returns 校验结果; spec 解析失败时 inRange=true (跳过校验)
 */
export function checkWordCount(content: string, spec: string): WordCountCheckResult {
  const parsed = parseWordCount(spec);
  if (!parsed) {
    return { inRange: true, actualCount: countChineseChars(content), min: null, max: null };
  }
  const actual = countChineseChars(content);
  const { min, max } = parsed;

  if (min !== null && actual < min) {
    return {
      inRange: false,
      actualCount: actual,
      min,
      max,
      diff: `actual ${actual} < min ${min} (差 ${min - actual})`,
    };
  }
  if (max !== null && actual > max) {
    return {
      inRange: false,
      actualCount: actual,
      min,
      max,
      diff: `actual ${actual} > max ${max} (超 ${actual - max})`,
    };
  }
  return { inRange: true, actualCount: actual, min, max };
}
