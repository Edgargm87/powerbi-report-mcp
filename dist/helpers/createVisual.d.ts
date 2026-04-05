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
    shapeType?: string;
    shapeRotation?: number;
    fillColor?: string;
    textContent?: string;
    textColor?: string;
    textAlign?: "left" | "center" | "right";
    textSize?: number;
    textBold?: boolean;
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
/** Visual types that require howCreated: "InsertVisualButton" in the JSON */
export declare const INSERT_BUTTON_VISUAL_TYPES: Set<string>;
/** All slicer visual types */
export declare const SLICER_VISUAL_TYPES: Set<string>;
export declare const FieldSpecSchema: z.ZodObject<{
    field: z.ZodOptional<z.ZodString>;
    entity: z.ZodOptional<z.ZodString>;
    property: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<{
        column: "column";
        measure: "measure";
        aggregation: "aggregation";
    }>;
    aggregation: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const BucketBindingSchema: z.ZodObject<{
    bucket: z.ZodString;
    fields: z.ZodArray<z.ZodObject<{
        field: z.ZodOptional<z.ZodString>;
        entity: z.ZodOptional<z.ZodString>;
        property: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<{
            column: "column";
            measure: "measure";
            aggregation: "aggregation";
        }>;
        aggregation: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const FormatCategorySchema: z.ZodObject<{
    category: z.ZodString;
    properties: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
}, z.core.$strip>;
export declare const DataColorSchema: z.ZodObject<{
    color: z.ZodString;
    seriesName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
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
            type: z.ZodEnum<{
                column: "column";
                measure: "measure";
                aggregation: "aggregation";
            }>;
            aggregation: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    autoFilters: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    slicerMode: z.ZodOptional<z.ZodEnum<{
        Basic: "Basic";
        Dropdown: "Dropdown";
    }>>;
    shapeType: z.ZodOptional<z.ZodEnum<{
        rectangle: "rectangle";
        rectangleRounded: "rectangleRounded";
        line: "line";
        tabCutCorner: "tabCutCorner";
        tabCutTopCorners: "tabCutTopCorners";
        tabRoundCorner: "tabRoundCorner";
        tabRoundTopCorners: "tabRoundTopCorners";
    }>>;
    shapeRotation: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    fillColor: z.ZodOptional<z.ZodString>;
    textContent: z.ZodOptional<z.ZodString>;
    textColor: z.ZodOptional<z.ZodString>;
    textAlign: z.ZodOptional<z.ZodEnum<{
        left: "left";
        center: "center";
        right: "right";
    }>>;
    textSize: z.ZodOptional<z.ZodNumber>;
    textBold: z.ZodOptional<z.ZodBoolean>;
    title: z.ZodOptional<z.ZodString>;
    containerFormat: z.ZodOptional<z.ZodArray<z.ZodObject<{
        category: z.ZodString;
        properties: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    }, z.core.$strip>>>;
    visualFormat: z.ZodOptional<z.ZodArray<z.ZodObject<{
        category: z.ZodString;
        properties: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    }, z.core.$strip>>>;
    dataColors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        color: z.ZodString;
        seriesName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare function parseFieldSpec(spec: FieldSpecInput): FieldRef;
export declare function createAndSaveVisual(project: PbirProject, pageId: string, spec: VisualSpec, baseZ: number): {
    visualId: string;
    visualType: string;
};
