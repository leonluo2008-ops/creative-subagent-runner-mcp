// 一次性测试脚本：直接调两个 LLM client，验证 juxinapi 联通
import { callOpenAICompatible } from "../src/llm/openaiCompatibleClient.js";
import { callGeminiNative } from "../src/llm/geminiNativeClient.js";

async function testOpenAI() {
  console.log("\n========== Testing OpenAI-compatible (gpt-5.5) ==========");
  try {
    const result = await callOpenAICompatible({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: "你是一个测试助手。" },
        { role: "user", content: "只回复 OK 这两个字，不要别的。" },
      ],
      temperature: 0.1,
      max_tokens: 20,
      timeoutMs: 60000,
    });
    console.log("✅ OpenAI-compatible OK");
    console.log("   Model used:", result.model);
    console.log("   Content:   ", result.content);
    console.log("   Usage:     ", JSON.stringify(result.usage));
  } catch (err) {
    console.error("❌ OpenAI-compatible FAILED:", err instanceof Error ? err.message : err);
  }
}

async function testGemini() {
  console.log("\n========== Testing Gemini native (gemini-3.1-pro-preview) ==========");
  try {
    const result = await callGeminiNative({
      model: "gemini-3.1-pro-preview",
      systemPrompt: "你是一个测试助手。",
      userPrompt: "只回复 OK 这两个字，不要别的。",
      temperature: 0.1,
      maxOutputTokens: 20,
      timeoutMs: 60000,
    });
    console.log("✅ Gemini native OK");
    console.log("   Model used:", result.model);
    console.log("   Content:   ", result.content);
    console.log("   Usage:     ", JSON.stringify(result.usage));
  } catch (err) {
    console.error("❌ Gemini native FAILED:", err instanceof Error ? err.message : err);
  }
}

await testOpenAI();
await testGemini();
console.log("\n========== All tests done ==========");
process.exit(0);