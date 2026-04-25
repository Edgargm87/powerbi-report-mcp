"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// Page-id auto-resolution
//
// Most reports have one page during early authoring, and forcing the LLM to
// `pbir_list_pages` → grab the id → pass it on every call burns ~50 tokens per
// hop for zero information value. When pageId is omitted and there's exactly
// one page, we pick it. With multiple pages we return a structured error
// listing the available ids — the LLM can pick from the list without an
// extra `pbir_list_pages` round-trip.
//
// Destructive page ops (pbir_delete_page, pbir_duplicate_page) opt out — auto-resolving
// "delete the page" without explicit intent is a foot-gun nobody asked for.
// ═══════════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePageId = resolvePageId;
/**
 * Resolve a (possibly missing) pageId into a concrete page id.
 *
 * - pageId given           → pass-through.
 * - pageId omitted, 1 page → use that page.
 * - pageId omitted, 0/N>1  → structured error with availableIds.
 */
function resolvePageId(project, pageId) {
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
                            hint: "Report has no pages. Call pbir_create_page first.",
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
