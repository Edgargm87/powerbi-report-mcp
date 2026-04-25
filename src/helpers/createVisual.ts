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
  containerFormat?: Array<{ category: string; properties: Record<string, string | number | boolean> }>;
  visualFormat?: Array<{ category: string; properties: Record<string, string | number | boolean> }>;
  dataColors?: Array<{ color: string; seriesName?: string }>;
  // image params
  imageUrl?: string;
  imageScaling?: "fit" | "fill" | "normal";
  // actionButton params
  buttonText?: string;
  buttonAction?: "pageNavigation" | "URL" | "bookmark" | "back";
  buttonActionTarget?: string;
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

/**
 * Friendly font name → PBIR font stack, as written by Power BI Desktop.
 * Each stack is the exact string that goes inside the `fontFamily` DAX literal
 * (the outer `'…'` wrapper and the `'name'` → `''name''` escaping are added by
 * the caller). Keys are case-insensitive when looked up.
 */
export const POWER_BI_FONT_STACKS: Record<string, string> = {
  "Segoe UI":           "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
  "Segoe UI Bold":      "'Segoe UI Bold', wf_segoe-ui_bold, helvetica, arial, sans-serif",
  "Segoe UI Light":     "'Segoe UI Light', wf_segoe-ui_light, helvetica, arial, sans-serif",
  "Segoe UI Semibold":  "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif",
  "DIN":                "wf_standard-font, helvetica, arial, sans-serif",
  "Arial":              "Arial, helvetica, sans-serif",
  "Arial Black":        "'Arial Black', Arial, helvetica, sans-serif",
  "Calibri":            "Calibri, helvetica, arial, sans-serif",
  "Cambria":            "Cambria, Georgia, serif",
  "Candara":            "Candara, Calibri, Arial, helvetica, sans-serif",
  "Comic Sans MS":      "'Comic Sans MS', 'Marker Felt', sans-serif",
  "Consolas":           "Consolas, 'Courier New', Courier, monospace",
  "Constantia":         "Constantia, Georgia, serif",
  "Corbel":             "Corbel, Candara, Calibri, Arial, helvetica, sans-serif",
  "Courier New":        "'Courier New', Courier, monospace",
  "Georgia":            "Georgia, serif",
  "Lucida Console":     "'Lucida Console', monospace",
  "Tahoma":             "Tahoma, Verdana, Segoe, sans-serif",
  "Times New Roman":    "'Times New Roman', Times, serif",
  "Trebuchet MS":       "'Trebuchet MS', Tahoma, Verdana, Segoe, sans-serif",
  "Verdana":            "Verdana, Geneva, sans-serif",
};

/**
 * Resolve a user-supplied font value into the raw stack string that goes
 * inside a `fontFamily` DAX literal (without the outer quote wrapper).
 *
 * - If `font` matches a known friendly name (case-insensitive), use the mapped stack.
 * - Otherwise use `font` verbatim (power-user escape hatch for custom stacks).
 */
export function resolveFontStack(font: string): string {
  const key = Object.keys(POWER_BI_FONT_STACKS).find(
    (k) => k.toLowerCase() === font.toLowerCase()
  );
  return key ? POWER_BI_FONT_STACKS[key] : font;
}

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
    .describe("Table name. Use 'field' shorthand or entity+property."),
  property: z
    .string()
    .optional()
    .describe("Column or measure name. Use 'field' shorthand or entity+property."),
  type: z
    .enum(["column", "measure", "aggregation"])
    .describe("'column' for raw column, 'aggregation' for aggregated column, 'measure' for DAX measure"),
  aggregation: z
    .string()
    .optional()
    .describe("Aggregation function: Sum, Avg, Count, Min, Max, CountNonNull, Median, StandardDeviation, Variance"),
});

export const BucketBindingSchema = z.object({
  bucket: z.string().describe("Data role bucket (e.g. Category, Y, Series, Values, Rows)"),
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
  multiSelect: z
    .boolean()
    .optional()
    .describe(
      "Slicer selection mode (slicer/listSlicer). true=multi-select (checkbox), false=single-select. Omit for PBI default."
    ),
  shapeType: z
    .enum(["rectangle", "rectangleRounded", "line", "tabCutCorner", "tabCutTopCorners", "tabRoundCorner", "tabRoundTopCorners"])
    .optional(),
  shapeRotation: z.number().optional().default(0),
  fillColor: z
    .string()
    .optional()
    .describe("Shape fill color (hex, default #D9D9D9)"),
  textContent: z.string().optional().describe("Text inside shape/textbox"),
  textColor: z.string().optional().describe("Text color (hex)"),
  textAlign: z
    .enum(["left", "center", "right"])
    .optional()
    .describe("Horizontal text alignment"),
  textVAlign: z
    .enum(["top", "middle", "bottom"])
    .optional()
    .describe("Vertical text alignment (shape only)"),
  textFont: z
    .string()
    .optional()
    .describe(
      "Font family for shape text. Friendly names like 'Segoe UI Bold', 'Arial', 'DIN' " +
        "are auto-mapped to the full Power BI font stack; unknown values are used verbatim."
    ),
  textSize: z.number().optional().describe("Font size in pt"),
  textBold: z.boolean().optional().describe("Bold text"),
  textItalic: z.boolean().optional().describe("Italic text (shape only)"),
  textUnderline: z.boolean().optional().describe("Underlined text (shape only)"),
  textPadding: z
    .number()
    .optional()
    .describe("Inner padding in px applied to all 4 sides of shape text"),
  title: z.string().optional(),
  containerFormat: z
    .array(FormatCategorySchema)
    .optional()
    .describe("Inline container formatting (title/background/border/padding)"),
  visualFormat: z
    .array(FormatCategorySchema)
    .optional()
    .describe("Inline visual formatting (axes/legend/labels)"),
  dataColors: z
    .array(DataColorSchema)
    .optional()
    .describe("Inline data point colors"),
  // image
  imageUrl: z.string().optional().describe("Image URL (for image visual type)"),
  imageScaling: z.enum(["fit", "fill", "normal"]).optional().describe("Image scaling mode (default fit)"),
  // actionButton
  buttonText: z.string().optional().describe("Button label text (for actionButton)"),
  buttonAction: z
    .enum(["pageNavigation", "URL", "bookmark", "back"])
    .optional()
    .describe("Button action type (for actionButton)"),
  buttonActionTarget: z
    .string()
    .optional()
    .describe("Action target: page ID for pageNavigation, URL string for URL, bookmark ID for bookmark"),
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
    multiSelect,
    shapeType,
    shapeRotation = 0,
    fillColor,
    textContent,
    textColor,
    textAlign,
    textVAlign,
    textFont,
    textSize,
    textBold,
    textItalic,
    textUnderline,
    textPadding,
    title,
    containerFormat,
    visualFormat,
    dataColors,
    imageUrl,
    imageScaling = "fit",
    buttonText,
    buttonAction,
    buttonActionTarget,
  } = spec;

  // Normalise basicShape → shape
  const visualType = spec.visualType === "basicShape" ? "shape" : spec.visualType;
  const slicerDefaultTypes = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
  // Slicer house defaults: 184×60. Matches the training-report pattern —
  // 184 wide holds common Segoe UI 8pt category labels without truncation;
  // 60 tall fits a single-row dropdown slicer with ~5px gap to the next row.
  const width = rawWidth ?? (slicerDefaultTypes.has(visualType) ? 184 : 280);
  let height = rawHeight ?? (slicerDefaultTypes.has(visualType) ? 60 : 280);
  // Minimum render height for slicers: Power BI clips dropdowns under ~44px.
  // Auto-bump any caller-supplied height below the floor — the LLM occasionally
  // passes 40 to cram slicers into a filter bar, but the control renders broken.
  // See skills/slicers.md ("House defaults"): 44 is the hard floor.
  if (slicerDefaultTypes.has(visualType) && height < 44) {
    height = 44;
  }
  const zVal = baseZ;

  // Build query state from bindings
  const queryState: QueryState = {};
  if (bindings && bindings.length > 0) {
    for (const binding of bindings) {
      let bucketName = binding.bucket;
      // Bucket coercion: see bindingApply.ts for the full rationale. Mirrors
      // the same logic so add_visual and update_visual_bindings stay in lockstep.
      const validBuckets = VISUAL_BUCKETS[visualType as keyof typeof VISUAL_BUCKETS];
      if (validBuckets && validBuckets.length > 0 && !validBuckets.includes(bucketName)) {
        const isGenericPlaceholder = ["Field", "Fields", "Category", "Categories"].includes(bucketName);
        const isSingleBucketVisual = validBuckets.length === 1;
        if (isGenericPlaceholder || isSingleBucketVisual) {
          bucketName = validBuckets[0];
        }
      }
      const projections: Projection[] = binding.fields.map((fieldSpec, i) => {
        const field = parseFieldSpec(fieldSpec);
        const isFirst =
          i === 0 &&
          (bucketName === "Category" ||
            (SLICER_VISUAL_TYPES.has(visualType) && (bucketName === "Values" || bucketName === "Rows")));
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
  // Primary dimension bucket: "Category" for most charts; "Details" is
  // kept as a fallback only for treemap (legacy scatter revisions used
  // "Details" but Desktop actually writes "Category" — see pbir.ts).
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
  if (!sortDefinition && SLICER_VISUAL_TYPES.has(visualType)) {
    // advancedSlicerVisual uses "Rows"; classic slicer/listSlicer/textSlicer use "Values"
    const slicerBucket = queryState.Values ?? queryState.Rows;
    if (slicerBucket?.projections?.[0]) {
      sortDefinition = {
        sort: [
          {
            field: JSON.parse(JSON.stringify(slicerBucket.projections[0].field)),
            direction: "Ascending" as const,
          },
        ],
      };
    }
  }

  // Build visual objects (for slicers, shapes, textboxes)
  let visualObjects: Record<string, unknown> | undefined;
  if (visualType === "slicer") {
    const mode = slicerMode || "Dropdown";
    // Selection properties:
    //   - multiSelect param wins when provided (writes singleSelect literal)
    //   - Default for Dropdown (no multiSelect set): strictSingleSelect=true
    //   - Default for Basic: nothing (PBI default = multi-select)
    const selectionProps: Record<string, unknown> = {};
    if (multiSelect !== undefined) {
      selectionProps.singleSelect = {
        expr: { Literal: { Value: multiSelect ? "false" : "true" } },
      };
    }
    if (mode === "Dropdown" && multiSelect === undefined) {
      selectionProps.strictSingleSelect = { expr: { Literal: { Value: "true" } } };
    }
    const slicerObjects: Record<string, unknown> = {
      data: [{ properties: { mode: { expr: { Literal: { Value: `'${mode}'` } } } } }],
    };
    if (Object.keys(selectionProps).length > 0) {
      slicerObjects.selection = [{ properties: selectionProps }];
    }
    visualObjects = slicerObjects;
  } else if (visualType === "listSlicer" && multiSelect !== undefined) {
    // listSlicer is always-expanded; only the selection mode is configurable here.
    visualObjects = {
      selection: [
        {
          properties: {
            singleSelect: {
              expr: { Literal: { Value: multiSelect ? "false" : "true" } },
            },
          },
        },
      ],
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
      // Shape text lives in objects.text as a two-entry format-object array:
      //   [0] show toggle (no selector)
      //   [1] properties with selector { id: "default" }
      //
      // Escape single quotes for the DAX literal by doubling them.
      const escapedText = textContent.replace(/'/g, "''");
      const textProps: Record<string, unknown> = {
        text: { expr: { Literal: { Value: `'${escapedText}'` } } },
      };
      if (textColor) {
        // Hex → solid literal
        textProps.fontColor = {
          solid: { color: { expr: { Literal: { Value: `'${textColor}'` } } } },
        };
      } else {
        // Default → theme data color 1 (matches Power BI Desktop default)
        textProps.fontColor = {
          solid: { color: { expr: { ThemeDataColor: { ColorId: 1, Percent: 0 } } } },
        };
      }
      if (textAlign) {
        textProps.horizontalAlignment = {
          expr: { Literal: { Value: `'${textAlign}'` } },
        };
      }
      if (textVAlign) {
        textProps.verticalAlignment = {
          expr: { Literal: { Value: `'${textVAlign}'` } },
        };
      }
      if (textPadding !== undefined) {
        const pad = `${Math.round(textPadding)}L`;
        textProps.leftMargin = { expr: { Literal: { Value: pad } } };
        textProps.topMargin = { expr: { Literal: { Value: pad } } };
        textProps.rightMargin = { expr: { Literal: { Value: pad } } };
        textProps.bottomMargin = { expr: { Literal: { Value: pad } } };
      }
      // Font decorations — all confirmed against Power BI Desktop output.
      if (textBold) {
        textProps.bold = { expr: { Literal: { Value: "true" } } };
      }
      if (textItalic) {
        textProps.italic = { expr: { Literal: { Value: "true" } } };
      }
      if (textUnderline) {
        textProps.underline = { expr: { Literal: { Value: "true" } } };
      }
      if (textSize) {
        textProps.fontSize = { expr: { Literal: { Value: `${textSize}D` } } };
      }
      if (textFont) {
        // Resolve friendly name to the full Power BI font stack, then wrap as
        // a DAX literal — CSS-level single quotes in the stack (e.g.
        // `'Segoe UI Bold'`) must be doubled inside the DAX literal.
        const stack = resolveFontStack(textFont);
        const escapedStack = stack.replace(/'/g, "''");
        textProps.fontFamily = {
          expr: { Literal: { Value: `'${escapedStack}'` } },
        };
      }
      shapeObjs.text = [
        {
          properties: {
            show: { expr: { Literal: { Value: "true" } } },
          },
        },
        {
          properties: textProps,
          selector: { id: "default" },
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
  } else if (visualType === "image") {
    // Build image objects when a URL is provided
    if (imageUrl) {
      visualObjects = {
        general: [
          {
            properties: {
              imageUrl: { expr: { Literal: { Value: `'${imageUrl}'` } } },
              scaling: { expr: { Literal: { Value: `'${imageScaling}'` } } },
            },
          },
        ],
      };
    }
  } else if (visualType === "actionButton") {
    const btnObjs: Record<string, unknown> = {};

    // Button label text
    if (buttonText) {
      btnObjs.text = [
        {
          properties: {
            text: { expr: { Literal: { Value: `'${buttonText}'` } } },
            show: { expr: { Literal: { Value: "true" } } },
          },
        },
      ];
    }

    // Button action
    if (buttonAction) {
      const actionProps: Record<string, unknown> = {};

      if (buttonAction === "back") {
        actionProps.type = { expr: { Literal: { Value: "'Back'" } } };
      } else if (buttonAction === "URL" && buttonActionTarget) {
        actionProps.type = { expr: { Literal: { Value: "'WebUrl'" } } };
        actionProps.url = { expr: { Literal: { Value: `'${buttonActionTarget}'` } } };
      } else if (buttonAction === "pageNavigation") {
        actionProps.type = { expr: { Literal: { Value: "'PageNavigation'" } } };
        if (buttonActionTarget) {
          // Section reference — page ID as PBIR Section expression
          actionProps.navigationSection = {
            expr: { Section: { Section: buttonActionTarget } },
          };
        }
      } else if (buttonAction === "bookmark" && buttonActionTarget) {
        actionProps.type = { expr: { Literal: { Value: "'Bookmark'" } } };
        actionProps.bookmarkDisplayName = { expr: { Literal: { Value: `'${buttonActionTarget}'` } } };
      }

      if (Object.keys(actionProps).length > 0) {
        btnObjs.action = [{ properties: actionProps }];
      }
    }

    if (Object.keys(btnObjs).length > 0) {
      visualObjects = btnObjs;
    }
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

  // Slicer house default: title off (unless user passed a title string).
  // Applied BEFORE containerFormat so the user can still explicitly turn it back on.
  const slicerTypes = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
  if (slicerTypes.has(visualType) && !title) {
    applyFormattingToTarget(visual.visual.visualContainerObjects as Record<string, unknown>, [
      { category: "title", properties: { show: false } },
    ]);
  }

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
            show: true,
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
