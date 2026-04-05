import type { VisualDefinition } from "../pbir.js";
export declare function buildFormattingProps(properties: Record<string, string | number | boolean>): Record<string, unknown>;
export declare function applyFormattingToTarget(targetObj: Record<string, unknown>, formatting: Array<{
    category: string;
    properties: Record<string, string | number | boolean>;
}>): void;
export declare function applyDataColors(visual: VisualDefinition, colors: Array<{
    color: string;
    seriesName?: string;
}>, defaultTransparency?: number): void;
