// ═══════════════════════════════════════════════════════════════════════════════
// Layout Validation
//
// Thin policy layer around `validateWireframe()`. Takes a list of visual
// positions, runs the pure validator, and decides — based on the strict/warn/off
// mode — whether to BLOCK the write (strict), attach warnings (warn), or skip
// entirely (off).
//
// Translates the raw `WireframeIssue` into the richer `LayoutError` shape
// documented in docs/design-layout-accuracy.md: every issue carries a
// machine-readable `code`, the actual numbers the caller sent, the limits
// it tripped, a plain-English `suggestion`, the underlying `rule`, and a
// `guide` pointer. Same design principle as the binding-validation errors
// — errors must teach the LLM how to fix itself.
//
// Three modes, resolved from (per-call param → env var → default strict):
//   strict  — any error-severity issue aborts the call
//   warn    — writes proceed; errors are downgraded and returned as warnings
//   off     — validator is not run at all
//
// COLUMN_MISALIGN / ROW_MISALIGN are always warnings regardless of mode —
// they're aesthetic rules that legitimately break with spanning visuals.
// ═══════════════════════════════════════════════════════════════════════════════

import { CANVAS, validateWireframe } from "../wireframe-validator.js";
import type { WireframeIssue, WireframeVisual } from "../wireframe-validator.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LayoutMode = "strict" | "warn" | "off";

/**
 * Stable machine-readable error codes. These are the codes the LLM will see
 * in responses — keep them stable across releases.
 */
export type LayoutErrorCode =
  | "out_of_bounds_right"
  | "out_of_bounds_bottom"
  | "out_of_bounds_negative"
  | "overlap"
  | "wrong_left_margin"
  | "wrong_right_margin"
  | "wrong_bottom_margin"
  | "wrong_horizontal_gap"
  | "wrong_vertical_gap"
  | "silent_default_position"
  | "rounding_overflow"
  | "banner_position"
  | "banner_width"
  | "negative_dimension"
  | "column_misalign"
  | "row_misalign";

export interface LayoutError {
  code: LayoutErrorCode;
  severity: "error" | "warning";
  visualIds: string[]; // labels/ids/titles from the validator
  actual?: { x: number; y: number; width: number; height: number };
  limits?: Record<string, number>;
  suggestion: string;
  rule: string;
  guide: string;
  /** Original human-readable message from the validator. */
  rawMessage: string;
}

export interface LayoutValidationOutcome {
  mode: LayoutMode;
  proceed: boolean;
  errors: LayoutError[];   // error-severity items (blocking in strict mode)
  warnings: LayoutError[]; // warning-severity items (never block)
  /** Canvas constants echoed for the response — zero cost to include. */
  canvas: typeof CANVAS;
}

// ---------------------------------------------------------------------------
// Mode resolution (per-call > env > default)
// ---------------------------------------------------------------------------

const DEFAULT_MODE: LayoutMode = "strict";

function resolveMode(strictLayout: boolean | undefined): LayoutMode {
  if (strictLayout === true) return "strict";
  if (strictLayout === false) return "warn";
  const env = (process.env.MCP_LAYOUT_VALIDATION || "").toLowerCase();
  if (env === "strict" || env === "warn" || env === "off") return env;
  return DEFAULT_MODE;
}

// ---------------------------------------------------------------------------
// Issue → LayoutError translation
// ---------------------------------------------------------------------------

const GUIDE = "Call guide('wireframes') for the canonical layout rules (margins, gaps, banner, 5-column grid math).";

/**
 * Codes that are ALWAYS warnings regardless of mode. These are aesthetic
 * rules — blocking them would force flat, uniform layouts.
 */
const ALWAYS_WARN: ReadonlySet<string> = new Set(["COLUMN_MISALIGN", "ROW_MISALIGN"]);

/**
 * Translate a raw WireframeIssue into a teaching LayoutError. Enriches with
 * explicit limits, a plain-English suggestion, and a pointer to the skill.
 * The original `message` is preserved as `rawMessage` so we don't lose info.
 */
function translateIssue(
  issue: WireframeIssue,
  visualsById: Map<string, WireframeVisual>
): LayoutError {
  const firstId = issue.visuals[0];
  const actual = firstId ? visualsById.get(firstId) : undefined;
  const actualPos = actual
    ? { x: actual.x, y: actual.y, width: actual.width, height: actual.height }
    : undefined;

  // Default severity mirrors the issue's (validator decides error vs warning),
  // except for the always-warn codes.
  const severity: "error" | "warning" = ALWAYS_WARN.has(issue.code)
    ? "warning"
    : issue.severity === "info"
      ? "warning"
      : issue.severity;

  const base = {
    visualIds: issue.visuals,
    severity,
    rawMessage: issue.message,
    guide: GUIDE,
    actual: actualPos,
  };

  switch (issue.code) {
    case "OUT_OF_BOUNDS": {
      // The validator reports three flavours under one code: negative x/y,
      // right-edge overflow, bottom-edge overflow. Pick the most specific
      // code by inspecting the actual position.
      if (actual && (actual.x < 0 || actual.y < 0)) {
        return {
          ...base,
          code: "out_of_bounds_negative",
          limits: { minX: 0, minY: 0 },
          suggestion: `Set x≥0 and y≥0. Non-banner content should start at x≥${CANVAS.marginLeft}, y≥${CANVAS.firstContentRowY}.`,
          rule: "x and y must be ≥ 0.",
        };
      }
      if (actual && actual.x + actual.width > CANVAS.width) {
        const rightEdge = actual.x + actual.width;
        const maxAllowed = CANVAS.width - CANVAS.marginRight;
        return {
          ...base,
          code: "out_of_bounds_right",
          limits: {
            maxRightEdge: maxAllowed,
            canvasWidth: CANVAS.width,
            yourRightEdge: rightEdge,
            usableWidth: CANVAS.usableWidth,
          },
          suggestion: `Reduce width to ${maxAllowed - actual.x} (keep x=${actual.x}) OR move x to ${maxAllowed - actual.width} (keep width=${actual.width}).`,
          rule: `x + width must be ≤ ${maxAllowed} (${CANVAS.marginLeft}px L / ${CANVAS.marginRight}px R margins on a ${CANVAS.width}px canvas).`,
        };
      }
      if (actual && actual.y + actual.height > CANVAS.height) {
        const bottomEdge = actual.y + actual.height;
        const maxAllowed = CANVAS.height - CANVAS.marginBottom;
        return {
          ...base,
          code: "out_of_bounds_bottom",
          limits: {
            maxBottomEdge: maxAllowed,
            canvasHeight: CANVAS.height,
            yourBottomEdge: bottomEdge,
            usableHeight: CANVAS.usableHeight,
          },
          suggestion: `Reduce height to ${maxAllowed - actual.y} (keep y=${actual.y}) OR move y to ${maxAllowed - actual.height} (keep height=${actual.height}).`,
          rule: `y + height must be ≤ ${maxAllowed} (${CANVAS.marginBottom}px bottom margin on a ${CANVAS.height}px canvas).`,
        };
      }
      return {
        ...base,
        code: "out_of_bounds_right",
        limits: { canvasWidth: CANVAS.width, canvasHeight: CANVAS.height },
        suggestion: `Position and size so x + width ≤ ${CANVAS.width - CANVAS.marginRight} and y + height ≤ ${CANVAS.height - CANVAS.marginBottom}.`,
        rule: `Visual must fit within the ${CANVAS.usableWidth}×${CANVAS.usableHeight} usable canvas.`,
      };
    }

    case "OVERLAP":
      return {
        ...base,
        code: "overlap",
        suggestion: "Move one of the visuals so their rectangles don't intersect. Maintain a 5px gap between adjacent visuals.",
        rule: "No two visuals may have overlapping x/y/width/height rectangles.",
      };

    case "LEFT_MARGIN":
      return {
        ...base,
        code: "wrong_left_margin",
        limits: { requiredLeftX: CANVAS.marginLeft },
        suggestion: `Move x to ${CANVAS.marginLeft} (the canonical left margin).`,
        rule: `The leftmost visual in every row must start at x=${CANVAS.marginLeft}.`,
      };

    case "RIGHT_MARGIN":
      return {
        ...base,
        code: "wrong_right_margin",
        limits: { requiredRightEdge: CANVAS.width - CANVAS.marginRight },
        suggestion: `Adjust width so x+width = ${CANVAS.width - CANVAS.marginRight} on the rightmost visual of each row.`,
        rule: `The rightmost visual in every row must end at x+width=${CANVAS.width - CANVAS.marginRight}.`,
      };

    case "BOTTOM_MARGIN":
      return {
        ...base,
        code: "wrong_bottom_margin",
        limits: { maxBottomEdge: CANVAS.height - CANVAS.marginBottom },
        suggestion: `Adjust y+height so the bottom row ends at y+height ≤ ${CANVAS.height - CANVAS.marginBottom}.`,
        rule: `Bottom row must end at y+height ≤ ${CANVAS.height - CANVAS.marginBottom} (${CANVAS.marginBottom}px breathing room).`,
      };

    case "WRONG_GAP_H":
      return {
        ...base,
        code: "wrong_horizontal_gap",
        limits: { requiredGap: CANVAS.gap },
        suggestion: `Space adjacent visuals in a row so the gap between right-edge of one and left-edge of next equals exactly ${CANVAS.gap}px.`,
        rule: `Horizontal gap between adjacent visuals in a row must be exactly ${CANVAS.gap}px.`,
      };

    case "WRONG_GAP_V":
      return {
        ...base,
        code: "wrong_vertical_gap",
        limits: { requiredGap: CANVAS.gap },
        suggestion: `Space rows so the gap between the bottom of row N and the top of row N+1 equals exactly ${CANVAS.gap}px.`,
        rule: `Vertical gap between adjacent rows must be exactly ${CANVAS.gap}px.`,
      };

    case "SILENT_DEFAULT":
      return {
        ...base,
        code: "silent_default_position",
        suggestion: `Provide explicit x and y. Non-banner visuals typically start at x≥${CANVAS.marginLeft}, y≥${CANVAS.firstContentRowY}.`,
        rule: "Only banner visuals may sit at (0,0). All other visuals need explicit coordinates.",
      };

    case "ROUNDING_OVERFLOW":
      return {
        ...base,
        code: "rounding_overflow",
        limits: { usableWidth: CANVAS.usableWidth, usableHeight: CANVAS.usableHeight },
        suggestion: "When splitting the canvas into N equal columns, distribute the 1–2 pixel remainder — give the first few cells an extra pixel of width rather than leaving a sub-5px gap at the edge.",
        rule: `Sum of widths + (N-1)×${CANVAS.gap}px gaps must exactly equal ${CANVAS.usableWidth}px.`,
      };

    case "BANNER_POSITION":
      return {
        ...base,
        code: "banner_position",
        limits: { bannerX: 0, bannerY: CANVAS.bannerY, bannerHeight: CANVAS.bannerHeight },
        suggestion: `Banner shape must sit at x=0, y=${CANVAS.bannerY}, height=${CANVAS.bannerHeight}.`,
        rule: "Banner is exempted from margins and must pin to the top-left.",
      };

    case "BANNER_WIDTH":
      return {
        ...base,
        code: "banner_width",
        limits: { bannerWidth: CANVAS.width },
        suggestion: `Banner shape must span the full canvas width (${CANVAS.width}px).`,
        rule: `Banner width must equal canvas width (${CANVAS.width}px).`,
      };

    case "NEGATIVE_DIMENSION":
      return {
        ...base,
        code: "negative_dimension",
        suggestion: "Width and height must be positive integers. Typical minimum for a readable visual is 80×60.",
        rule: "width > 0 and height > 0.",
      };

    case "COLUMN_MISALIGN":
      return {
        ...base,
        code: "column_misalign",
        suggestion: "If the drift is unintentional, align columns in row N+1 to the x-coordinates of row N. Legitimate with column-spans — ignore in that case.",
        rule: "Columns across rows should share x-coordinates unless a visual spans multiple columns.",
      };

    case "ROW_MISALIGN":
      return {
        ...base,
        code: "row_misalign",
        suggestion: "If the drift is unintentional, align rows in column N+1 to the y-coordinates of column N. Legitimate with row-spans — ignore in that case.",
        rule: "Rows across columns should share y-coordinates unless a visual spans multiple rows.",
      };
  }
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Run the wireframe validator on a candidate layout and apply mode policy.
 *
 * Callers pass in EVERY visual that will be on the page after the write
 * completes — i.e. existing visuals + the new ones. The validator needs the
 * full picture to detect overlaps and alignment correctly.
 *
 * @param visuals   Full expected page layout (existing + new)
 * @param strictLayout  Per-call override: true→strict, false→warn, undefined→env
 */
export function runLayoutValidation(
  visuals: WireframeVisual[],
  strictLayout: boolean | undefined
): LayoutValidationOutcome {
  const mode = resolveMode(strictLayout);

  if (mode === "off" || visuals.length === 0) {
    return { mode, proceed: true, errors: [], warnings: [], canvas: CANVAS };
  }

  const report = validateWireframe(visuals);
  const byId = new Map<string, WireframeVisual>();
  for (const v of visuals) {
    const key = v.title || v.id || v.visualType;
    // Issue labels prefer title, then id, then visualType — match that order.
    if (!byId.has(key)) byId.set(key, v);
  }

  const errors: LayoutError[] = [];
  const warnings: LayoutError[] = [];
  for (const issue of report.issues) {
    const translated = translateIssue(issue, byId);
    if (translated.severity === "error") errors.push(translated);
    else warnings.push(translated);
  }

  // Strict mode: errors block. Warn mode: downgrade errors to warnings, still proceed.
  if (mode === "strict") {
    return {
      mode,
      proceed: errors.length === 0,
      errors,
      warnings,
      canvas: CANVAS,
    };
  }

  // warn mode — fold errors into warnings, always proceed
  return {
    mode,
    proceed: true,
    errors: [],
    warnings: [...errors.map((e) => ({ ...e, severity: "warning" as const })), ...warnings],
    canvas: CANVAS,
  };
}

/**
 * Convenience — pull a compact canvas summary for inclusion in tool responses.
 * Smaller than echoing the full CANVAS const.
 */
export function getCanvasSummary(): {
  width: number; height: number;
  usableWidth: number; usableHeight: number;
  margins: { left: number; right: number; top: number; bottom: number };
  gap: number;
  bannerHeight: number;
  firstContentRowY: number;
} {
  return {
    width: CANVAS.width,
    height: CANVAS.height,
    usableWidth: CANVAS.usableWidth,
    usableHeight: CANVAS.usableHeight,
    margins: {
      left: CANVAS.marginLeft,
      right: CANVAS.marginRight,
      top: CANVAS.marginTop,
      bottom: CANVAS.marginBottom,
    },
    gap: CANVAS.gap,
    bannerHeight: CANVAS.bannerHeight,
    firstContentRowY: CANVAS.firstContentRowY,
  };
}
