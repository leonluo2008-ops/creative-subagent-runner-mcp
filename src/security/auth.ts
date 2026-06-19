// =====================================================================
// auth.ts — Bearer Token 鉴权
// 简单常量时间比较，避免时序攻击
// =====================================================================
import type { Request, Response, NextFunction } from "express";
import { env } from "../utils/env.js";
import { safeError } from "./redact.js";

/**
 * 期望的 Authorization header 格式: "Bearer <token>"
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid Authorization header. Expected: Bearer <token>",
    });
    return;
  }

  const token = auth.slice("Bearer ".length).trim();

  if (!constantTimeEqual(token, env.MCP_AUTH_TOKEN)) {
    safeError("auth_failed", new Error(`invalid token from ${req.ip ?? "unknown"}`));
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid Bearer token.",
    });
    return;
  }

  next();
}

/**
 * 常量时间字符串比较
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}