import { z } from "zod";
import {
  PbirProject,
  generateId,
  columnRef,
  aggregationRef,
  measureRef,
  buildQueryRef,
  buildNativeQueryRef,
  buildAutoFilters,
  AggregationFunction,
  VISUAL_BUCKETS,
} from "../pbir.js";
import type { VisualDefinition, Projection, QueryState, FieldRef } from "../pbir.js";
import { buildFormattingProps, applyFormattingToTarget, applyDataColors } from "./formatting.js";

// --- VisualSpec interface ---
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
  containerFormat?: Array<{ category: string; properties: Record<string, string | number | boolean> }>;
  visualFormat?: Array<{ category: string; properties: Record<string, string | number | boolean> }>;
  dataColors?: Array<{ color: string; seriesName?: string }>;
}

// --- Field spec input type (supports Table[Column] shorthand) ---
export interface FieldSpecInput {
  /** Shorthand: 'Table[Column]' — parsed automatically into entity + property */
  field?: string;
  entity?: string;
  property?: string;
  type: "column" | "measure" | "aggregation";
  aggregation?: string;
}

/** Visual types that have no data binding and no default font formatting */
export const NO_DATA_VISUAL_TYPES = new Set([
  "textbox", "basicShape", "shape", "image", "actionButton", "pageNavigator",
]);

/** Visual types that require howCreated: "InsertVisualButton" in the JSON */
export const INSERT_BUTTON_VISUAL_TYPES = new Set(["actionButton", "pageNavigator", "image"]);

/** All slicer visual types */
export const SLICER_VISUAL_TYPES = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);

// --- Zod schemas (exported for use in tools) ---
export const FieldSpecSchema = z.object({
  field: z
    .string()
    .optional()
    .describe("Shorthand: 'Table[Column]' or 'Table[Measure]' (e.g. 'Sales[Net Price]')"),
  entity: z
    .string()
    .optional()
    .describe("Table/entity name (e.g. 'financials'). Use either 'field' shorthand or both entity+property."),
  property: z
    .string()
    .optional()
    .describe("Column or measure name (e.g. 'Gross Sales'). Use either 'field' shorthand or both entity+property."),
  type: z
    .enum(["column", "measure", "aggregation"])
    .describe("'column' for raw column, 'aggregation' for aggregated column, 'measure' for DAX measure"),
  aggregation: z
    .string()
    .optional()
    .describe("Aggregation function: Sum, Avg, Count, Min, Max, CountNonNull, Median, StandardDeviation, Variance"),
});

export const BucketBindingSchema = z.object({
  bucket: z.string().describe("Data role bucket name (e.g. 'Category', 'Y', 'Series', 'Values', 'Rows')"),
  fields: z.array(FieldSpecSchema).describe("Fields to bind to this bucket"),
});

export const FormatCategorySchema = z.object({
  category: z.string().describe("Formatting category"),
  properties: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .describe("Property key-value pairs"),
});

export const DataColorSchema = z.object({
  color: z.string().describe("Hex color like '#CD191C'"),
  seriesName: z.string().optional().describe("Series metadata selector"),
});

export const VisualSpecSchema = z.object({
  visualType: z.string().describe("The visual type"),
  x: z.number().optional().default(0).describe("X position"),
  y: z.number().optional().default(0).describe("Y position"),
  width: z.number().optional().default(280).describe("Width"),
  height: z.number().optional().default(280).describe("Height"),
  bindings: z.array(BucketBindingSchema).optional().describe("Data bindings"),
  autoFilters: z.boolean().optional().default(true),
  slicerMode: z.enum(["Basic", "Dropdown"]).optional(),
  shapeType: z
    .enum(["rectangle", "rectangleRounded", "line", "tabCutCorner", "tabCutTopCorners", "tabRoundCorner", "tabRoundTopCorners"])
    .optional(),
  shapeRotation: z.number().optional().default(0),
  fillColor: z
    .string()
    .optional()
    .describe("Fill color for shapes (hex, e.g. '#D9D9D9'). Defaults to #D9D9D9 if not provided."),
  textContent: z.string().optional().describe("Text label displayed inside a shape or textbox"),
  textColor: z.string().optional().describe("Text color (hex, e.g. '#595959')"),
  textAlign: z
    .enum(["left", "center", "right"])
    .optional()
    .describe("Horizontal text alignment inside shape/textbox"),
  textSize: z.number().optional().describe("Font size in pt (e.g. 10)"),
  textBold: z.boolean().optional().describe("Bold text"),
  title: z.string().optional(),
  containerFormat: z
    .array(FormatCategorySchema)
    .optional()
    .describe(
      "Inline container formatting (title, background, border, padding, dropShadow, visualHeader)"
    ),
  visualFormat: z
    .array(FormatCategorySchema)
    .optional()
    .describe("Inline visual formatting (axes, legend, labels, lineStyles, etc.)"),
  dataColors: z
    .array(DataColorSchema)
    .optional()
    .describe("Inline data point colors"),
});

// --- Parse field specification — supports Table[Column] shorthand ---
export function parseFieldSpec(spec: FieldSpecInput): FieldRef {
  let entity: string;
  let property: string;

  if (spec.field) {
    // Parse "Table[Column]" notation
    const match = spec.field.match(/^(.+)\[(.+)\]$/);
    if (match) {
      entity = match[1].trim();
      property = match[2].trim();
    } else {
      throw new Error(
        `Invalid field shorthand: "${spec.field}". Expected format: 'Table[Column]' (e.g. 'Sales[Net Price]').`
      );
    }
  } else if (spec.entity && spec.property) {
    entity = spec.entity;
    property = spec.property;
  } else {
    throw new Error(
      "Field spec must include either 'field' (e.g. 'Table[Column]') or both 'entity' and 'property'."
    );
  }

  if (spec.type === "measure") {
    return measureRef(entity, property);
  }
  if (spec.type === "aggregation") {
    const func = AggregationFunction[spec.aggregation || "Sum"] ?? 0;
    return aggregationRef(entity, property, func);
  }
  return columnRef(entity, property);
}

// --- Create a single visual and save it ---
export function createAndSaveVisual(
  project: PbirProject,
  pageId: string,
  spec: VisualSpec,
  baseZ: number
): { visualId: string; visualType: string } {
  const visualId = generateId();
  const {
    x = 0,
    y = 0,
    width: rawWidth,
    height: rawHeight,
    bindings,
    autoFilters = true,
    slicerMode,
    shapeType,
    shapeRotation = 0,
    fillColor,
    textContent,
    textColor,
    textAlign,
    textSize,
    textBold,
    title,
    containerFormat,
    visualFormat,
    dataColors,
  } = spec;

  // Normalise basicShape → shape
  const visualType = spec.visualType === "basicShape" ? "shape" : spec.visualType;
  const slicerDefaultTypes = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
  const width = rawWidth ?? (slicerDefaultTypes.has(visualType) ? 168 : 280);
  const height = rawHeight ?? (slicerDefaultTypes.has(visualType) ? 65 : 280);
  const zVal = baseZ;

  // Build query state from bindings
  const queryState: QueryState = {};
  if (bindings && bindings.length > 0) {
    for (const binding of bindings) {
      let bucketName = binding.bucket;
      if (bucketName === "Fields") {
        const validBuckets = VISUAL_BUCKETS[visualType as keyof typeof VISUAL_BUCKETS];
        if (validBuckets && validBuckets.length > 0 && !validBuckets.includes("Fields")) {
          bucketName = validBuckets[0];
        }
      }
      const projections: Projection[] = binding.fields.map((fieldSpec, i) => {
        const field = parseFieldSpec(fieldSpec);
        const isFirst =
          i === 0 &&
          (bucketName === "Category" || (SLICER_VISUAL_TYPES.has(visualType) && bucketName === "Values"));
        return {
          field,
          queryRef: buildQueryRef(field),
          nativeQueryRef: buildNativeQueryRef(field),
          ...(isFirst ? { active: true } : {}),
        };
      });
      queryState[bucketName] = { projections };
    }
  }

  // Build sort definition
  let sortDefinition:
    | { sort: { field: FieldRef; direction: "Ascending" | "Descending" }[]; isDefaultSort?: boolean }
    | undefined;
  // Category bucket (most charts) or Details bucket (scatterChart)
  const categoryBucket = queryState.Category ?? queryState.Details;
  if (categoryBucket?.projections?.[0]) {
    sortDefinition = {
      sort: [
        {
          field: JSON.parse(JSON.stringify(categoryBucket.projections[0].field)),
          direction: "Ascending" as const,
        },
      ],
      isDefaultSort: true,
    };
  }
  if (!sortDefinition && SLICER_VISUAL_TYPES.has(visualType) && queryState.Values?.projections?.[0]) {
    sortDefinition = {
      sort: [
        {
          field: JSON.parse(JSON.stringify(queryState.Values.projections[0].field)),
          direction: "Ascending" as const,
        },
      ],
    };
  }

  // Build visual objects (for slicers, shapes, textboxes)
  let visualObjects: Record<string, unknown> | undefined;
  if (visualType === "slicer") {
    const mode = slicerMode || "Dropdown";
    // Dropdown: add strictSingleSelect=true (matches PBI default for dropdowns)
    // Basic: just set mode, no extra selection properties
    visualObjects =
      mode === "Dropdown"
        ? {
            data: [{ properties: { mode: { expr: { Literal: { Value: `'${mode}'` } } } } }],
            selection: [
              {
                properties: {
                  strictSingleSelect: { expr: { Literal: { Value: "true" } } },
                },
              },
            ],
          }
        : {
            data: [{ properties: { mode: { expr: { Literal: { Value: `'${mode}'` } } } } }],
          };
  } else if (visualType === "shape") {
    const tile = shapeType || "rectangle";
    const color = fillColor || "#D9D9D9";
    const shapeObjs: Record<string, unknown> = {
      shape: [{ properties: { tileShape: { expr: { Literal: { Value: `'${tile}'` } } } } }],
      rotation: [
        {
          properties: {
            shapeAngle: { expr: { Literal: { Value: `${shapeRotation}L` } } },
          },
        },
      ],
      fill: [
        {
          properties: {
            fillColor: { solid: { color: { expr: { Literal: { Value: `'${color}'` } } } } },
          },
          selector: { id: "default" },
        },
      ],
      outline: [{ properties: { show: { expr: { Literal: { Value: "false" } } } } }],
    };
    if (textContent) {
      const textStyle: Record<string, unknown> = {};
      if (textColor) textStyle.color = textColor;
      if (textBold) textStyle.fontWeight = "bold";
      if (textSize) textStyle.fontSize = `${textSize}pt`;
      shapeObjs.general = [
        {
          properties: {
            paragraphs: [
              {
                textRuns: [
                  {
                    value: textContent,
                    ...(Object.keys(textStyle).length ? { textStyle } : {}),
                  },
                ],
                horizontalTextAlignment: textAlign || "center",
              },
            ],
          },
        },
      ];
    }
    visualObjects = shapeObjs;
  } else if (visualType === "textbox") {
    const text = textContent || "";
    const textStyle: Record<string, unknown> = {};
    if (textColor) textStyle.color = textColor;
    if (textBold) textStyle.fontWeight = "bold";
    if (textSize) textStyle.fontSize = `${textSize}pt`;
    visualObjects = {
      general: [
        {
          properties: {
            paragraphs: [
              {
                textRuns: [
                  {
                    value: text,
                    ...(Object.keys(textStyle).length ? { textStyle } : {}),
                  },
                ],
                horizontalTextAlignment: textAlign || "left",
              },
            ],
          },
        },
      ],
    };
  }

  const visual: VisualDefinition = {
    $schema:
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json",
    name: visualId,
    position: { x, y, z: zVal, height, width, tabOrder: zVal },
    visual: {
      visualType,
      ...(Object.keys(queryState).length > 0
        ? { query: { queryState, ...(sortDefinition ? { sortDefinition } : {}) } }
        : {}),
      ...(visualObjects ? { objects: visualObjects } : {}),
      ...(INSERT_BUTTON_VISUAL_TYPES.has(visualType) ? { visualContainerObjects: {} } : {}),
      drillFilterOtherVisuals: true,
    },
    ...(INSERT_BUTTON_VISUAL_TYPES.has(visualType) ? { howCreated: "InsertVisualButton" } : {}),
  };

  // Add title
  if (title) {
    visual.visual.visualContainerObjects = {
      title: [{ properties: { text: { expr: { Literal: { Value: `'${title}'` } } } } }],
    };
  }

  // Apply default font (fontSize 8, Segoe UI) to title — overridable by containerFormat
  if (!visual.visual.visualContainerObjects) visual.visual.visualContainerObjects = {};
  applyFormattingToTarget(visual.visual.visualContainerObjects as Record<string, unknown>, [
    {
      category: "title",
      properties: {
        fontSize: 8,
        fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
      },
    },
  ]);

  // Apply inline container formatting
  if (containerFormat && containerFormat.length > 0) {
    applyFormattingToTarget(
      visual.visual.visualContainerObjects as Record<string, unknown>,
      containerFormat
    );
  }

  // Apply default font to visual-level objects (axes, labels, legend for charts; items/header for slicers)
  const defaultVisualFont = {
    fontSize: 8,
    fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
  };
  const slicerTypes = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
  if (!NO_DATA_VISUAL_TYPES.has(visualType)) {
    if (!visual.visual.objects) visual.visual.objects = {};
    if (slicerTypes.has(visualType)) {
      applyFormattingToTarget(visual.visual.objects as Record<string, unknown>, [
        {
          category: "items",
          properties: {
            textSize: 8,
            fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
          },
        },
        {
          category: "header",
          properties: {
            textSize: 8,
            fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
          },
        },
      ]);
    } else {
      applyFormattingToTarget(visual.visual.objects as Record<string, unknown>, [
        { category: "categoryAxis", properties: defaultVisualFont },
        { category: "valueAxis", properties: defaultVisualFont },
        { category: "labels", properties: defaultVisualFont },
        { category: "legend", properties: defaultVisualFont },
      ]);
    }
  }

  // Apply inline visual formatting
  if (visualFormat && visualFormat.length > 0) {
    if (!visual.visual.objects) visual.visual.objects = {};
    applyFormattingToTarget(visual.visual.objects as Record<string, unknown>, visualFormat);
  }

  // Apply inline data colors
  if (dataColors && dataColors.length > 0) {
    applyDataColors(visual, dataColors);
  }

  // Add auto-filters
  if (autoFilters && Object.keys(queryState).length > 0) {
    visual.filterConfig = { filters: buildAutoFilters(queryState) };
  }

  project.saveVisual(pageId, visualId, visual);
  return { visualId, visualType };
}
