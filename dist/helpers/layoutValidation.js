"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLayoutValidation = runLayoutValidation;
exports.getCanvasSummary = getCanvasSummary;
const wireframe_validator_js_1 = require("../wireframe-validator.js");
// ---------------------------------------------------------------------------
// Mode resolution (per-call > env > default)
// ---------------------------------------------------------------------------
const DEFAULT_MODE = "strict";
function resolveMode(strictLayout) {
    if (strictLayout === true)
        return "strict";
    if (strictLayout === false)
        return "warn";
    const env = (process.env.MCP_LAYOUT_VALIDATION || "").toLowerCase();
    if (env === "strict" || env === "warn" || env === "off")
        return env;
    return DEFAULT_MODE;
}
// ---------------------------------------------------------------------------
// Issue → LayoutError translation
// ---------------------------------------------------------------------------
/**
 * Codes that are ALWAYS warnings regardless of mode. These are aesthetic
 * rules — blocking them would force flat, uniform layouts.
 */
const ALWAYS_WARN = new Set(["COLUMN_MISALIGN", "ROW_MISALIGN"]);
/**
 * Translate a raw WireframeIssue into a teaching LayoutError. Enriches with
 * explicit limits, a plain-English suggestion, and a pointer to the skill.
 * The original `message` is preserved as `rawMessage` so we don't lose info.
 */
function translateIssue(issue, visualsById) {
    const firstId = issue.visuals[0];
    const actual = firstId ? visualsById.get(firstId) : undefined;
    const actualPos = actual
        ? { x: actual.x, y: actual.y, width: actual.width, height: actual.height }
        : undefined;
    // Default severity mirrors the issue's (validator decides error vs warning),
    // except for the always-warn codes.
    const severity = ALWAYS_WARN.has(issue.code)
        ? "warning"
        : issue.severity === "info"
            ? "warning"
            : issue.severity;
    const base = {
        visualIds: issue.visuals,
        severity,
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
                    suggestion: `Set x≥0 and y≥0. Non-banner content should start at x≥${wireframe_validator_js_1.CANVAS.marginLeft}, y≥${wireframe_validator_js_1.CANVAS.firstContentRowY}.`,
                };
            }
            if (actual && actual.x + actual.width > wireframe_validator_js_1.CANVAS.width) {
                const rightEdge = actual.x + actual.width;
                const maxAllowed = wireframe_validator_js_1.CANVAS.width - wireframe_validator_js_1.CANVAS.marginRight;
                return {
                    ...base,
                    code: "out_of_bounds_right",
                    limits: {
                        maxRightEdge: maxAllowed,
                        canvasWidth: wireframe_validator_js_1.CANVAS.width,
                        yourRightEdge: rightEdge,
                        usableWidth: wireframe_validator_js_1.CANVAS.usableWidth,
                    },
                    suggestion: `Reduce width to ${maxAllowed - actual.x} (keep x=${actual.x}) OR move x to ${maxAllowed - actual.width} (keep width=${actual.width}).`,
                };
            }
            if (actual && actual.y + actual.height > wireframe_validator_js_1.CANVAS.height) {
                const bottomEdge = actual.y + actual.height;
                const maxAllowed = wireframe_validator_js_1.CANVAS.height - wireframe_validator_js_1.CANVAS.marginBottom;
                return {
                    ...base,
                    code: "out_of_bounds_bottom",
                    limits: {
                        maxBottomEdge: maxAllowed,
                        canvasHeight: wireframe_validator_js_1.CANVAS.height,
                        yourBottomEdge: bottomEdge,
                        usableHeight: wireframe_validator_js_1.CANVAS.usableHeight,
                    },
                    suggestion: `Reduce height to ${maxAllowed - actual.y} (keep y=${actual.y}) OR move y to ${maxAllowed - actual.height} (keep height=${actual.height}).`,
                };
            }
            return {
                ...base,
                code: "out_of_bounds_right",
                limits: { canvasWidth: wireframe_validator_js_1.CANVAS.width, canvasHeight: wireframe_validator_js_1.CANVAS.height },
                suggestion: `Position and size so x + width ≤ ${wireframe_validator_js_1.CANVAS.width - wireframe_validator_js_1.CANVAS.marginRight} and y + height ≤ ${wireframe_validator_js_1.CANVAS.height - wireframe_validator_js_1.CANVAS.marginBottom}.`,
            };
        }
        case "OVERLAP":
            return {
                ...base,
                code: "overlap",
                suggestion: "Move one of the visuals so their rectangles don't intersect. Maintain a 5px gap between adjacent visuals.",
            };
        case "LEFT_MARGIN":
            return {
                ...base,
                code: "wrong_left_margin",
                limits: { requiredLeftX: wireframe_validator_js_1.CANVAS.marginLeft },
                suggestion: `Move x to ${wireframe_validator_js_1.CANVAS.marginLeft} (the canonical left margin).`,
            };
        case "RIGHT_MARGIN":
            return {
                ...base,
                code: "wrong_right_margin",
                limits: { requiredRightEdge: wireframe_validator_js_1.CANVAS.width - wireframe_validator_js_1.CANVAS.marginRight },
                suggestion: `Adjust width so x+width = ${wireframe_validator_js_1.CANVAS.width - wireframe_validator_js_1.CANVAS.marginRight} on the rightmost visual of each row.`,
            };
        case "BOTTOM_MARGIN":
            return {
                ...base,
                code: "wrong_bottom_margin",
                limits: { maxBottomEdge: wireframe_validator_js_1.CANVAS.height - wireframe_validator_js_1.CANVAS.marginBottom },
                suggestion: `Adjust y+height so the bottom row ends at y+height ≤ ${wireframe_validator_js_1.CANVAS.height - wireframe_validator_js_1.CANVAS.marginBottom}.`,
            };
        case "WRONG_GAP_H":
            return {
                ...base,
                code: "wrong_horizontal_gap",
                limits: { requiredGap: wireframe_validator_js_1.CANVAS.gap },
                suggestion: `Space adjacent visuals in a row so the gap between right-edge of one and left-edge of next equals exactly ${wireframe_validator_js_1.CANVAS.gap}px.`,
            };
        case "WRONG_GAP_V":
            return {
                ...base,
                code: "wrong_vertical_gap",
                limits: { requiredGap: wireframe_validator_js_1.CANVAS.gap },
                suggestion: `Space rows so the gap between the bottom of row N and the top of row N+1 equals exactly ${wireframe_validator_js_1.CANVAS.gap}px.`,
            };
        case "SILENT_DEFAULT":
            return {
                ...base,
                code: "silent_default_position",
                suggestion: `Provide explicit x and y. Non-banner visuals typically start at x≥${wireframe_validator_js_1.CANVAS.marginLeft}, y≥${wireframe_validator_js_1.CANVAS.firstContentRowY}.`,
            };
        case "ROUNDING_OVERFLOW":
            return {
                ...base,
                code: "rounding_overflow",
                limits: { usableWidth: wireframe_validator_js_1.CANVAS.usableWidth, usableHeight: wireframe_validator_js_1.CANVAS.usableHeight },
                suggestion: "When splitting the canvas into N equal columns, distribute the 1–2 pixel remainder — give the first few cells an extra pixel of width rather than leaving a sub-5px gap at the edge.",
            };
        case "BANNER_POSITION":
            return {
                ...base,
                code: "banner_position",
                limits: { bannerX: 0, bannerY: wireframe_validator_js_1.CANVAS.bannerY, bannerHeight: wireframe_validator_js_1.CANVAS.bannerHeight },
                suggestion: `Banner shape must sit at x=0, y=${wireframe_validator_js_1.CANVAS.bannerY}, height=${wireframe_validator_js_1.CANVAS.bannerHeight}.`,
            };
        case "BANNER_WIDTH":
            return {
                ...base,
                code: "banner_width",
                limits: { bannerWidth: wireframe_validator_js_1.CANVAS.width },
                suggestion: `Banner shape must span the full canvas width (${wireframe_validator_js_1.CANVAS.width}px).`,
            };
        case "NEGATIVE_DIMENSION":
            return {
                ...base,
                code: "negative_dimension",
                suggestion: "Width and height must be positive integers. Typical minimum for a readable visual is 80×60.",
            };
        case "COLUMN_MISALIGN":
            return {
                ...base,
                code: "column_misalign",
                suggestion: "If the drift is unintentional, align columns in row N+1 to the x-coordinates of row N. Legitimate with column-spans — ignore in that case.",
            };
        case "ROW_MISALIGN":
            return {
                ...base,
                code: "row_misalign",
                suggestion: "If the drift is unintentional, align rows in column N+1 to the y-coordinates of column N. Legitimate with row-spans — ignore in that case.",
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
function runLayoutValidation(visuals, strictLayout) {
    const mode = resolveMode(strictLayout);
    if (mode === "off" || visuals.length === 0) {
        return { mode, proceed: true, errors: [], warnings: [], canvas: wireframe_validator_js_1.CANVAS };
    }
    const report = (0, wireframe_validator_js_1.validateWireframe)(visuals);
    const byId = new Map();
    for (const v of visuals) {
        const key = v.title || v.id || v.visualType;
        // Issue labels prefer title, then id, then visualType — match that order.
        if (!byId.has(key))
            byId.set(key, v);
    }
    const errors = [];
    const warnings = [];
    for (const issue of report.issues) {
        const translated = translateIssue(issue, byId);
        if (translated.severity === "error")
            errors.push(translated);
        else
            warnings.push(translated);
    }
    // Strict mode: errors block. Warn mode: downgrade errors to warnings, still proceed.
    if (mode === "strict") {
        return {
            mode,
            proceed: errors.length === 0,
            errors,
            warnings,
            canvas: wireframe_validator_js_1.CANVAS,
        };
    }
    // warn mode — fold errors into warnings, always proceed
    return {
        mode,
        proceed: true,
        errors: [],
        warnings: [...errors.map((e) => ({ ...e, severity: "warning" })), ...warnings],
        canvas: wireframe_validator_js_1.CANVAS,
    };
}
/**
 * Convenience — pull a compact canvas summary for inclusion in tool responses.
 * Smaller than echoing the full CANVAS const.
 */
function getCanvasSummary() {
    return {
        width: wireframe_validator_js_1.CANVAS.width,
        height: wireframe_validator_js_1.CANVAS.height,
        usableWidth: wireframe_validator_js_1.CANVAS.usableWidth,
        usableHeight: wireframe_validator_js_1.CANVAS.usableHeight,
        margins: {
            left: wireframe_validator_js_1.CANVAS.marginLeft,
            right: wireframe_validator_js_1.CANVAS.marginRight,
            top: wireframe_validator_js_1.CANVAS.marginTop,
            bottom: wireframe_validator_js_1.CANVAS.marginBottom,
        },
        gap: wireframe_validator_js_1.CANVAS.gap,
        bannerHeight: wireframe_validator_js_1.CANVAS.bannerHeight,
        firstContentRowY: wireframe_validator_js_1.CANVAS.firstContentRowY,
    };
}
