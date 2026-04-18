"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// Visual title extraction
//
// The PBIR title payload is a deeply nested, loosely-typed expression tree:
//   visual.visualContainerObjects.title[0].properties.text.expr.Literal.Value
//
// with PowerQuery-style single-quote wrapping ('My Title'). This helper
// centralizes the traversal so list_visuals, get_visual, get_page_summary, and
// any future caller share one source of truth. Returns null when the title is
// missing, malformed, or empty.
// ═══════════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractVisualTitle = extractVisualTitle;
/**
 * Extract the visual title text from a visual definition, stripping the
 * single-quote wrapping PBIR uses for string literals.
 *
 * @param visualContainerObjects The `visual.visualContainerObjects` object
 * from a visual.json — pass the raw value; this helper handles undefined,
 * missing keys, non-array shapes, and empty arrays.
 * @returns The title text, or null if not set / malformed.
 */
function extractVisualTitle(visualContainerObjects) {
    if (!visualContainerObjects || typeof visualContainerObjects !== "object") {
        return null;
    }
    const titleArr = visualContainerObjects.title;
    if (!Array.isArray(titleArr) || titleArr.length === 0)
        return null;
    const first = titleArr[0];
    const raw = first?.properties?.text?.expr?.Literal?.Value;
    if (typeof raw !== "string" || raw.length === 0)
        return null;
    // Strip PowerQuery-style single-quote wrapping: 'My Title' -> My Title
    const stripped = raw.replace(/^'|'$/g, "");
    return stripped.length === 0 ? null : stripped;
}
