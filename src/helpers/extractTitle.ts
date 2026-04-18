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

// Minimal shape of the nested expression — everything is optional.
interface TitleLiteral {
  properties?: {
    text?: {
      expr?: {
        Literal?: {
          Value?: unknown;
        };
      };
    };
  };
}

/**
 * Extract the visual title text from a visual definition, stripping the
 * single-quote wrapping PBIR uses for string literals.
 *
 * @param visualContainerObjects The `visual.visualContainerObjects` object
 * from a visual.json — pass the raw value; this helper handles undefined,
 * missing keys, non-array shapes, and empty arrays.
 * @returns The title text, or null if not set / malformed.
 */
export function extractVisualTitle(
  visualContainerObjects: unknown
): string | null {
  if (!visualContainerObjects || typeof visualContainerObjects !== "object") {
    return null;
  }
  const titleArr = (visualContainerObjects as Record<string, unknown>).title;
  if (!Array.isArray(titleArr) || titleArr.length === 0) return null;

  const first = titleArr[0] as TitleLiteral | undefined;
  const raw = first?.properties?.text?.expr?.Literal?.Value;
  if (typeof raw !== "string" || raw.length === 0) return null;

  // Strip PowerQuery-style single-quote wrapping: 'My Title' -> My Title
  const stripped = raw.replace(/^'|'$/g, "");
  return stripped.length === 0 ? null : stripped;
}
