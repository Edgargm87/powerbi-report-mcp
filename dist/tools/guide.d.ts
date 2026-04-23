import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
export declare function listTopicsWithSummaries(): Array<{
    key: string;
    summary: string;
}>;
/**
 * Build a compact session-start banner — just the skills index, no inlined
 * file bodies. Every skill file is accessible via `guide(topic)`; the banner
 * is only a map, not the territory.
 *
 * Rationale: earlier versions inlined elicitation.md + wireframes.md +
 * report-design.md (~35KB / ~9k tokens) into every session. That bloated
 * the context for sessions that never built visuals, and — worse — surfaced
 * concrete example numbers (e.g. slicer 413x40 in wireframes.md) ahead of
 * the house-default docs (slicers.md), which led the LLM to copy wrong
 * sizes. The banner is now a pure index; skills load on demand.
 */
export declare function buildSkillsIndexBanner(): string;
export declare function registerGuideTool(server: McpServer, _ctx: ServerContext): void;
