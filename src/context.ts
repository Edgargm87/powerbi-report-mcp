import type { PbirProject } from "./pbir.js";
import { fail, type MCPResult } from "./helpers/mcpResult.js";

export interface ConnectResult {
  success: boolean;
  reportPath?: string;
  error?: string;
}

// Context object shared across all tool registration functions
export interface ServerContext {
  /** Returns the currently-connected report path, or null if not set */
  getReportPath: () => string | null;
  /** Connect (or switch) to a new report folder */
  connectReport: (targetPath: string) => ConnectResult;
  /** Proxy to PbirProject — throws if no report is connected */
  project: PbirProject;
}

/**
 * Gate for handlers that touch ctx.project. Returns null if a report is
 * connected, or a fail() MCPResult if not. Use as the first line of a handler:
 *
 *   const guard = requireProject(ctx);
 *   if (guard) return guard;
 *
 * Without this, the project-Proxy in src/index.ts throws on first property
 * access, which bubbles through safe() as a generic error and skips any
 * tool-specific input validation that would have given the user a cleaner
 * message.
 */
export function requireProject(ctx: ServerContext): MCPResult | null {
  if (!ctx.getReportPath()) {
    return fail("No report connected. Use set_report first.");
  }
  return null;
}
