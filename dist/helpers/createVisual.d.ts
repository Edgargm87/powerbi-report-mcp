import { z } from "zod";
import { PbirProject } from "../pbir.js";
import type { FieldRef } from "../pbir.js";
export interface VisualSpec {
    visualType: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    bindings?: Array<{
        bucket: string;
        fields: Array<FieldSpecInput>;
    }>;
    autoFilters?: boolean;
    slicerMode?: "Basic" | "Dropdown";
    /**
     * Slicer selection mode. Applies to `slicer` and `listSlicer` types.
     *   true  → multi-select (writes objects.selection.singleSelect = false)
     *   false → single-select (writes objects.selection.singleSelect = true)
     *   undefined → use Power BI default (Dropdown=single, Basic/listSlicer=multi)
     */
    multiSelect?: boolean;
    shapeType?: string;
    shapeRotation?: number;
    fillColor?: string;
    textContent?: string;
    textColor?: string;
    textAlign?: "left" | "center" | "right";
    textVAlign?: "top" | "middle" | "bottom";
    textFont?: string;
    textSize?: number;
    textBold?: boolean;
    textItalic?: boolean;
    textUnderline?: boolean;
    textPadding?: number;
    title?: string;
    containerFormat?: Array<{
        category: string;
        properties: Record<string, string | number | boolean>;
    }>;
    visualFormat?: Array<{
        category: string;
        properties: Record<string, string | number | boolean>;
    }>;
    dataColors?: Array<{
        color: string;
        seriesName?: string;
    }>;
    imageUrl?: string;
    imageScaling?: "fit" | "fill" | "normal";
    buttonText?: string;
    buttonAction?: "pageNavigation" | "URL" | "bookmark" | "back";
    buttonActionTarget?: string;
}
export interface FieldSpecInput {
    /** Shorthand: 'Table[Column]' — parsed automatically into entity + property */
    field?: string;
    entity?: string;
    property?: string;
    type: "column" | "measure" | "aggregation";
    aggregation?: string;
}
/** Visual types that have no data binding and no default font formatting */
export declare const NO_DATA_VISUAL_TYPES: Set<string>;
/**
 * Friendly font name → PBIR font stack, as written by Power BI Desktop.
 * Each stack is the exact string that goes inside the `fontFamily` DAX literal
 * (the outer `'…'` wrapper and the `'name'` → `''name''` escaping are added by
 * the caller). Keys are case-insensitive when looked up.
 */
export declare const POWER_BI_FONT_STACKS: Record<string, string>;
/**
 * Resolve a user-supplied font value into the raw stack string that goes
 * inside a `fontFamily` DAX literal (without the outer quote wrapper).
 *
 * - If `font` matches a known friendly name (case-insensitive), use the mapped stack.
 * - Otherwise use `font` verbatim (power-user escape hatch for custom stacks).
 */
export declare function resolveFontStack(font: string): string;
/** Visual types that require howCreated: "InsertVisualButton" in the JSON */
export declare const INSERT_BUTTON_VISUAL_TYPES: Set<string>;
/** All slicer visual types */
export declare const SLICER_VISUAL_TYPES: Set<string>;
export declare const FieldSpecSchema: z.ZodObject<{
    field: z.ZodOptional<z.ZodString>;
    entity: z.ZodOptional<z.ZodString>;
    property: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["column", "measure", "aggregation"]>;
    aggregation: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "measure" | "column" | "aggregation";
    aggregation?: string | undefined;
    entity?: string | undefined;
    property?: string | undefined;
    field?: string | undefined;
}, {
    type: "measure" | "column" | "aggregation";
    aggregation?: string | undefined;
    entity?: string | undefined;
    property?: string | undefined;
    field?: string | undefined;
}>;
export declare const BucketBindingSchema: z.ZodObject<{
    bucket: z.ZodString;
    fields: z.ZodArray<z.ZodObject<{
        field: z.ZodOptional<z.ZodString>;
        entity: z.ZodOptional<z.ZodString>;
        property: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["column", "measure", "aggregation"]>;
        aggregation: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "measure" | "column" | "aggregation";
        aggregation?: string | undefined;
        entity?: string | undefined;
        property?: string | undefined;
        field?: string | undefined;
    }, {
        type: "measure" | "column" | "aggregation";
        aggregation?: string | undefined;
        entity?: string | undefined;
        property?: string | undefined;
        field?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    bucket: string;
    fields: {
        type: "measure" | "column" | "aggregation";
        aggregation?: string | undefined;
        entity?: string | undefined;
        property?: string | undefined;
        field?: string | undefined;
    }[];
}, {
    bucket: string;
    fields: {
        type: "measure" | "column" | "aggregation";
        aggregation?: string | undefined;
        entity?: string | undefined;
        property?: string | undefined;
        field?: string | undefined;
    }[];
}>;
export declare const FormatCategorySchema: z.ZodObject<{
    category: z.ZodString;
    properties: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
}, "strip", z.ZodTypeAny, {
    properties: Record<string, string | number | boolean>;
    category: string;
}, {
    properties: Record<string, string | number | boolean>;
    category: string;
}>;
export declare const DataColorSchema: z.ZodObject<{
    color: z.ZodString;
    seriesName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    color: string;
    seriesName?: string | undefined;
}, {
    color: string;
    seriesName?: string | undefined;
}>;
export declare const VisualSpecSchema: z.ZodObject<{
    visualType: z.ZodString;
    x: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    y: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    width: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    height: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    bindings: z.ZodOptional<z.ZodArray<z.ZodObject<{
        bucket: z.ZodString;
        fields: z.ZodArray<z.ZodObject<{
            field: z.ZodOptional<z.ZodString>;
            entity: z.ZodOptional<z.ZodString>;
            property: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<["column", "measure", "aggregation"]>;
            aggregation: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "measure" | "column" | "aggregation";
            aggregation?: string | undefined;
            entity?: string | undefined;
            property?: string | undefined;
            field?: string | undefined;
        }, {
            type: "measure" | "column" | "aggregation";
            aggregation?: string | undefined;
            entity?: string | undefined;
            property?: string | undefined;
            field?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        bucket: string;
        fields: {
            type: "measure" | "column" | "aggregation";
            aggregation?: string | undefined;
            entity?: string | undefined;
            property?: string | undefined;
            field?: string | undefined;
        }[];
    }, {
        bucket: string;
        fields: {
            type: "measure" | "column" | "aggregation";
            aggregation?: string | undefined;
            entity?: string | undefined;
            property?: string | undefined;
            field?: string | undefined;
        }[];
    }>, "many">>;
    autoFilters: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    slicerMode: z.ZodOptional<z.ZodEnum<["Basic", "Dropdown"]>>;
    multiSelect: z.ZodOptional<z.ZodBoolean>;
    shapeType: z.ZodOptional<z.ZodEnum<["rectangle", "rectangleRounded", "line", "tabCutCorner", "tabCutTopCorners", "tabRoundCorner", "tabRoundTopCorners"]>>;
    shapeRotation: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    fillColor: z.ZodOptional<z.ZodString>;
    textContent: z.ZodOptional<z.ZodString>;
    textColor: z.ZodOptional<z.ZodString>;
    textAlign: z.ZodOptional<z.ZodEnum<["left", "center", "right"]>>;
    textVAlign: z.ZodOptional<z.ZodEnum<["top", "middle", "bottom"]>>;
    textFont: z.ZodOptional<z.ZodString>;
    textSize: z.ZodOptional<z.ZodNumber>;
    textBold: z.ZodOptional<z.ZodBoolean>;
    textItalic: z.ZodOptional<z.ZodBoolean>;
    textUnderline: z.ZodOptional<z.ZodBoolean>;
    textPadding: z.ZodOptional<z.ZodNumber>;
    title: z.ZodOptional<z.ZodString>;
    containerFormat: z.ZodOptional<z.ZodArray<z.ZodObject<{
        category: z.ZodString;
        properties: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    }, "strip", z.ZodTypeAny, {
        properties: Record<string, string | number | boolean>;
        category: string;
    }, {
        properties: Record<string, string | number | boolean>;
        category: string;
    }>, "many">>;
    visualFormat: z.ZodOptional<z.ZodArray<z.ZodObject<{
        category: z.ZodString;
        properties: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    }, "strip", z.ZodTypeAny, {
        properties: Record<string, string | number | boolean>;
        category: string;
    }, {
        properties: Record<string, string | number | boolean>;
        category: string;
    }>, "many">>;
    dataColors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        color: z.ZodString;
        seriesName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        color: string;
        seriesName?: string | undefined;
    }, {
        color: string;
        seriesName?: string | undefined;
    }>, "many">>;
    imageUrl: z.ZodOptional<z.ZodString>;
    imageScaling: z.ZodOptional<z.ZodEnum<["fit", "fill", "normal"]>>;
    buttonText: z.ZodOptional<z.ZodString>;
    buttonAction: z.ZodOptional<z.ZodEnum<["pageNavigation", "URL", "bookmark", "back"]>>;
    buttonActionTarget: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    width: number;
    height: number;
    x: number;
    y: number;
    visualType: string;
    autoFilters: boolean;
    shapeRotation: number;
    bindings?: {
        bucket: string;
        fields: {
            type: "measure" | "column" | "aggregation";
            aggregation?: string | undefined;
            entity?: string | undefined;
            property?: string | undefined;
            field?: string | undefined;
        }[];
    }[] | undefined;
    title?: string | undefined;
    slicerMode?: "Basic" | "Dropdown" | undefined;
    multiSelect?: boolean | undefined;
    shapeType?: "rectangle" | "rectangleRounded" | "line" | "tabCutCorner" | "tabCutTopCorners" | "tabRoundCorner" | "tabRoundTopCorners" | undefined;
    fillColor?: string | undefined;
    textContent?: string | undefined;
    textColor?: string | undefined;
    textAlign?: "left" | "center" | "right" | undefined;
    textVAlign?: "top" | "middle" | "bottom" | undefined;
    textFont?: string | undefined;
    textSize?: number | undefined;
    textBold?: boolean | undefined;
    textItalic?: boolean | undefined;
    textUnderline?: boolean | undefined;
    textPadding?: number | undefined;
    containerFormat?: {
        properties: Record<string, string | number | boolean>;
        category: string;
    }[] | undefined;
    visualFormat?: {
        properties: Record<string, string | number | boolean>;
        category: string;
    }[] | undefined;
    dataColors?: {
        color: string;
        seriesName?: string | undefined;
    }[] | undefined;
    imageUrl?: string | undefined;
    imageScaling?: "fill" | "fit" | "normal" | undefined;
    buttonText?: string | undefined;
    buttonAction?: "pageNavigation" | "URL" | "bookmark" | "back" | undefined;
    buttonActionTarget?: string | undefined;
}, {
    visualType: string;
    bindings?: {
        bucket: string;
        fields: {
            type: "measure" | "column" | "aggregation";
            aggregation?: string | undefined;
            entity?: string | undefined;
            property?: string | undefined;
            field?: string | undefined;
        }[];
    }[] | undefined;
    title?: string | undefined;
    width?: number | undefined;
    height?: number | undefined;
    x?: number | undefined;
    y?: number | undefined;
    autoFilters?: boolean | undefined;
    slicerMode?: "Basic" | "Dropdown" | undefined;
    multiSelect?: boolean | undefined;
    shapeType?: "rectangle" | "rectangleRounded" | "line" | "tabCutCorner" | "tabCutTopCorners" | "tabRoundCorner" | "tabRoundTopCorners" | undefined;
    shapeRotation?: number | undefined;
    fillColor?: string | undefined;
    textContent?: string | undefined;
    textColor?: string | undefined;
    textAlign?: "left" | "center" | "right" | undefined;
    textVAlign?: "top" | "middle" | "bottom" | undefined;
    textFont?: string | undefined;
    textSize?: number | undefined;
    textBold?: boolean | undefined;
    textItalic?: boolean | undefined;
    textUnderline?: boolean | undefined;
    textPadding?: number | undefined;
    containerFormat?: {
        properties: Record<string, string | number | boolean>;
        category: string;
    }[] | undefined;
    visualFormat?: {
        properties: Record<string, string | number | boolean>;
        category: string;
    }[] | undefined;
    dataColors?: {
        color: string;
        seriesName?: string | undefined;
    }[] | undefined;
    imageUrl?: string | undefined;
    imageScaling?: "fill" | "fit" | "normal" | undefined;
    buttonText?: string | undefined;
    buttonAction?: "pageNavigation" | "URL" | "bookmark" | "back" | undefined;
    buttonActionTarget?: string | undefined;
}>;
export declare function parseFieldSpec(spec: FieldSpecInput): FieldRef;
export declare function createAndSaveVisual(project: PbirProject, pageId: string, spec: VisualSpec, baseZ: number): {
    visualId: string;
    visualType: string;
};
