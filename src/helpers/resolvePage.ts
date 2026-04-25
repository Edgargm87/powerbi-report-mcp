// ═══════════════════════════════════════════════════════════════════════════════
// Page-id auto-resolution
//
// Most reports have one page during early authoring, and forcing the LLM to
// `list_pages` → grab the id → pass it on every call burns ~50 tokens per
// hop for zero information value. When pageId is omitted and there's exactly
// one page, we pick it. With multiple pages we return a structured error
// listing the available ids — the LLM can pick from the list without an
// extra `list_pages` round-trip.
//
// Destructive page ops (delete_page, duplicate_page) opt out — auto-resolving
// "delete the page" without explicit intent is a foot-gun nobody asked for.
// ═══════════════════════════════════════════════════════════════════════════════

import type { PbirProject } from "../pbir.js";

export interface ResolvePageError {
  resolved: false;
  /** Tool-shaped error response (already wrapped in MCP `content` envelope). */
  errorResponse: {
    content: Array<{ type: "text"; text: string }>;
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
export function resolvePageId(
  project: PbirProject,
  pageId: string | undefined
): ResolvePageResult {
  if (pageId) {
    return { resolved: true, pageId, autoResolved: false };
  }
  const meta = project.getPagesMetadata();
  const ids = meta.pageOrder ?? [];
  if (ids.length === 1) {
    return { resolved: true, pageId: ids[0], autoResolved: true };
  }
  if (ids.length === 0) {
    return {
      resolved: false,
      errorResponse: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: "no_pages",
              hint: "Report has no pages. Call create_page first.",
            }),
          },
        ],
        isError: true,
      },
    };
  }
  return {
    resolved: false,
    errorResponse: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "ambiguous_pageId",
            hint: "Multiple pages exist — pass pageId explicitly.",
            availableIds: ids,
          }),
        },
      ],
      isError: true,
    },
  };
}
