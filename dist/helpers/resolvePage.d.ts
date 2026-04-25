import type { PbirProject } from "../pbir.js";
export interface ResolvePageError {
    resolved: false;
    /** Tool-shaped error response (already wrapped in MCP `content` envelope). */
    errorResponse: {
        content: Array<{
            type: "text";
            text: string;
        }>;
        isError?: true;
    };
}
export interface ResolvePageOk {
    resolved: true;
    pageId: string;
    /** True when we picked it for the caller (helpful for telemetry / future hint). */
    autoResolved: boolean;
}
export type ResolvePageResult = ResolvePageOk | ResolvePageError;
/**
 * Resolve a (possibly missing) pageId into a concrete page id.
 *
 * - pageId given           → pass-through.
 * - pageId omitted, 1 page → use that page.
 * - pageId omitted, 0/N>1  → structured error with availableIds.
 */
export declare function resolvePageId(project: PbirProject, pageId: string | undefined): ResolvePageResult;
