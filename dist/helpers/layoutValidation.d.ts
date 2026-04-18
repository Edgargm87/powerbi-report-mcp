import { CANVAS } from "../wireframe-validator.js";
import type { WireframeVisual } from "../wireframe-validator.js";
export type LayoutMode = "strict" | "warn" | "off";
/**
 * Stable machine-readable error codes. These are the codes the LLM will see
 * in responses — keep them stable across releases.
 */
export type LayoutErrorCode = "out_of_bounds_right" | "out_of_bounds_bottom" | "out_of_bounds_negative" | "overlap" | "wrong_left_margin" | "wrong_right_margin" | "wrong_bottom_margin" | "wrong_horizontal_gap" | "wrong_vertical_gap" | "silent_default_position" | "rounding_overflow" | "banner_position" | "banner_width" | "negative_dimension" | "column_misalign" | "row_misalign";
export interface LayoutError {
    code: LayoutErrorCode;
    severity: "error" | "warning";
    visualIds: string[];
    actual?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
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
    errors: LayoutError[];
    warnings: LayoutError[];
    /** Canvas constants echoed for the response — zero cost to include. */
    canvas: typeof CANVAS;
}
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
export declare function runLayoutValidation(visuals: WireframeVisual[], strictLayout: boolean | undefined): LayoutValidationOutcome;
/**
 * Convenience — pull a compact canvas summary for inclusion in tool responses.
 * Smaller than echoing the full CANVAS const.
 */
export declare function getCanvasSummary(): {
    width: number;
    height: number;
    usableWidth: number;
    usableHeight: number;
    margins: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    };
    gap: number;
    bannerHeight: number;
    firstContentRowY: number;
};
