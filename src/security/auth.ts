// =====================================================================
// auth.ts — Bearer Token 鉴权 + 本机回环免鉴权
// 简单常量时间比较，避免时序攻击
//
// 2026-06-22 改造: 本机回环 (127.0.0.1 / ::1) 免鉴权, 公网/Tunnel 调用仍需 Bearer token
// 原因: skill 本机调用 MCP 不应每次手动填 token; 但保留公网鉴权防蹭
// =====================================================================
import type { Request, Response, NextFunction } from "express";
import { env } from "../utils/env.js";
import { safeError } from "./redact.js";

/**
 * 本机回环 IP 白名单 — 免鉴权
 * - 127.0.0.1 (IPv4 回环)
 * - ::1 (IPv6 回环)
 * - ::ffff:127.0.0.1 (IPv4-mapped IPv6, Node 在某些环境下会这么标)
 */
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLoopback(req: Request): boolean {
  const ip = req.ip ?? "";
  return LOOPBACK_IPS.has(ip);
}

/**
 * 期望的 Authorization header 格式: "Bearer <token>"
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction) {
  // 本机回环免鉴权 (2026-06-22 改造)
  if (isLoopback(req)) {
    return next();
  }

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

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid admin Authorization header. Expected: Bearer <admin-token>",
    });
    return;
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!constantTimeEqual(token, env.ADMIN_TOKEN)) {
    safeError("admin_auth_failed", new Error(`invalid admin token from ${req.ip ?? "unknown"}`));
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid admin token.",
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
