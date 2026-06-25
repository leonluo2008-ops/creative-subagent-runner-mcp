// =====================================================================
// contentCleaner.ts — MCP 解析层剥 CoT (v2.0.3 · 2026-06-26)
//
// 设计原则 (用户铁律):
//   - 不在 prompt 里禁 CoT (LLM 行为约束不靠谱, gemini 会换说法绕过)
//   - 在 MCP 解析返回结果时剥 CoT (确定性, 可测试)
//
// 处理范围:
//   - chapter_writer / reviser: 走 stripChainOfThought()
//   - structure_auditor / style_auditor: 走 tryExtractJson(), 不剥
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
