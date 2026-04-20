import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
export declare function listTopicsWithSummaries(): Array<{
    key: string;
    summary: string;
}>;
/**
 * Build a compact session-start banner that lists every skill topic with its
 * summary, plus inlines the two skills most needed before any visual work
 * (wireframes + report-design). Agents should read this once per session and
 * then call guide(topic) for detail on any other topic.
 */
export declare function buildSkillsIndexBanner(): string;
export declare function registerGuideTool(server: McpServer, _ctx: ServerContext): void;
