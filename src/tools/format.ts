import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applyFormattingToTarget, applyDataColors } from "../helpers/formatting.js";
import { FormatCategorySchema, DataColorSchema, NO_DATA_VISUAL_TYPES } from "../helpers/createVisual.js";
import { validateFormatting } from "../helpers/themeSchema.js";
import { THEME_PRESETS } from "../helpers/defaults.js";
import type { ServerContext } from "../context.js";
import type { FieldRef } from "../pbir.js";

// Categories that belong in visualContainerObjects (container chrome)
const CONTAINER_CATEGORIES = new Set([
  "title", "subTitle", "background", "border", "padding",
  "dropShadow", "visualHeader", "visualHeaderTooltip",
]);

export function registerFormatTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: set_visual_title
  // ============================================================
  server.tool(
    "set_visual_title",
    "Set or update the title of a visual. Can set text, visibility, font, size, alignment.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      title: z.string().optional().describe("The title text to display"),
      show: z.boolean().optional().describe("Whether to show the title (default true)"),
      fontSize: z.number().optional().describe("Font size (e.g. 8, 12, 14)"),
      fontFamily: z
        .string()
        .optional()
        .describe(
          "Font family (e.g. \"'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif\")"
        ),
      alignment: z.enum(["left", "center", "right"]).optional().describe("Title alignment"),
      titleWrap: z.boolean().optional().describe("Whether to wrap the title text"),
    },
    async ({ pageId, visualId, title, show, fontSize, fontFamily, alignment, titleWrap }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      if (!visual.visual.visualContainerObjects) {
        visual.visual.visualContainerObjects = {};
      }
      const titleProps: Record<string, unknown> = {};
      if (title !== undefined) {
        titleProps.text = { expr: { Literal: { Value: `'${title}'` } } };
      }
      if (show !== undefined) {
        titleProps.show = { expr: { Literal: { Value: show ? "true" : "false" } } };
      }
      if (fontSize !== undefined) {
        titleProps.fontSize = { expr: { Literal: { Value: `${fontSize}D` } } };
      }
      if (fontFamily !== undefined) {
        titleProps.fontFamily = { expr: { Literal: { Value: `'${fontFamily}'` } } };
      }
      if (alignment !== undefined) {
        titleProps.alignment = { expr: { Literal: { Value: `'${alignment}'` } } };
      }
      if (titleWrap !== undefined) {
        titleProps.titleWrap = { expr: { Literal: { Value: titleWrap ? "true" : "false" } } };
      }

      const existing = (
        visual.visual.visualContainerObjects as Record<string, unknown[]>
      ).title;
      if (Array.isArray(existing) && existing.length > 0) {
        const existingProps =
          (existing[0] as { properties: Record<string, unknown> }).properties || {};
        (existing[0] as { properties: Record<string, unknown> }).properties = {
          ...existingProps,
          ...titleProps,
        };
      } else {
        (visual.visual.visualContainerObjects as Record<string, unknown[]>).title = [
          { properties: titleProps },
        ];
      }

      ctx.project.saveVisual(pageId, visualId, visual);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, pageId, visualId, title, show }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: format_visual
  // ============================================================
  server.tool(
    "format_visual",
    "Format visual properties. Auto-routes title/background/border/padding/dropShadow/visualHeader to container, others to visual; override with target='visual'|'container'. Validates names against bundled theme schema (strict=false to skip). Gotchas: slicer uses `textSize`, not `fontSize` (items/header); waterfall uses `sentimentColors`, not `dataPoint`.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      formatting: z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, z.array(FormatCategorySchema))
        .describe("Array of formatting categories and their properties to set"),
      target: z
        .enum(["visual", "container", "auto"])
        .optional()
        .default("auto")
        .describe(
          "'auto' (default) routes container categories (title/background/border/padding/dropShadow/visualHeader) to visualContainerObjects and everything else to objects. Use 'visual' or 'container' to force."
        ),
      strict: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "When true (default), reject writes that contain unknown category or property names (per the bundled PBI theme schema). Set false to force-write anyway — only do this for schema-newer-than-bundled cases."
        ),
    },
    async ({ pageId, visualId, formatting, target, strict }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      const visualType = (visual.visual?.visualType as string) || "";

      // Pre-write validation against the bundled theme schema.
      // Unknown visualType skips silently (schema may lag); known type + typo fails loudly.
      if (strict && visualType) {
        const issues = validateFormatting(visualType, formatting);
        if (issues.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "Formatting rejected: unknown category or property names for this visualType.",
                  visualType,
                  issues,
                  hint:
                    "Call lookup_theme_property({ visualType, category }) to see valid names. " +
                    "If you're certain the schema is stale (PBI shipped something new), retry with strict: false.",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      if (target === "auto") {
        // Split formatting into container vs visual categories
        const containerFmt = formatting.filter((f) => CONTAINER_CATEGORIES.has(f.category));
        const visualFmt = formatting.filter((f) => !CONTAINER_CATEGORIES.has(f.category));
        if (containerFmt.length > 0) {
          const containerObj = (visual.visual.visualContainerObjects ??= {});
          applyFormattingToTarget(containerObj as Record<string, unknown>, containerFmt);
        }
        if (visualFmt.length > 0) {
          const visualObj = (visual.visual.objects ??= {});
          applyFormattingToTarget(visualObj as Record<string, unknown>, visualFmt);
        }
      } else {
        const targetObj =
          target === "container"
            ? (visual.visual.visualContainerObjects ??= {})
            : (visual.visual.objects ??= {});
        applyFormattingToTarget(targetObj as Record<string, unknown>, formatting);
      }

      ctx.project.saveVisual(pageId, visualId, visual);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              pageId,
              visualId,
              formatted: formatting.map((f) => f.category),
            }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: set_datapoint_colors
  // ============================================================
  server.tool(
    "set_datapoint_colors",
    "Set data point colors. For series-based charts (Series bucket) use metadata mode (default). For category-based charts (Category bucket, no Series) provide categoryEntity+categoryProperty to use data selector mode — required for barChart, columnChart, pieChart etc. with a single measure.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      colors: z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, z.array(DataColorSchema)).describe("Array of {seriesName, color} — seriesName is the category value or series name to color"),
      categoryEntity: z.string().optional().describe("Category table name — required for category-based charts (barChart, columnChart, pieChart etc.)"),
      categoryProperty: z.string().optional().describe("Category column name — required for category-based charts"),
      defaultTransparency: z
        .number()
        .optional()
        .describe("Default transparency for all data points (0-100)"),
    },
    async ({ pageId, visualId, colors, categoryEntity, categoryProperty, defaultTransparency }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      applyDataColors(visual, colors, defaultTransparency, categoryEntity, categoryProperty);
      ctx.project.saveVisual(pageId, visualId, visual);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, pageId, visualId, colorCount: colors.length }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: set_conditional_format
  // ============================================================
  server.tool(
    "set_conditional_format",
    "Apply conditional formatting to a visual container background or title font. formatType: rules (value comparisons), gradient (color scale), clear (remove). ComparisonKind: 0=Eq, 1=GT, 2=GTE, 3=LT, 4=LTE, 5=NEq.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      property: z
        .enum(["background", "title"])
        .default("background")
        .describe("Which property to apply conditional formatting to"),
      formatType: z
        .enum(["rules", "gradient", "clear"])
        .describe("Type of conditional formatting"),
      // Shared: measure/column driving the format
      entity: z.string().optional().describe("Table name of the driving field (e.g. 'Sales')"),
      property2: z.string().optional().describe("Column or measure name of the driving field (e.g. 'KPI Status')"),
      isMeasure: z.boolean().optional().default(true).describe("true if driving field is a DAX measure, false for column"),
      // Rules
      rules: z
        .array(
          z.object({
            comparisonKind: z.number().describe("0=Equal,1=GT,2=GTE,3=LT,4=LTE,5=NotEqual"),
            value: z.union([z.number(), z.string()]).describe("Comparison value (number or string)"),
            color: z.string().describe("Hex color when condition is true (e.g. '#00B050')"),
          })
        )
        .optional()
        .describe("For rules: ordered list of comparison → color rules (first match wins)"),
      defaultColor: z.string().optional().describe("Fallback color when no rule matches (hex)"),
      // Gradient
      minColor: z.string().optional().describe("For gradient: color at minimum value (hex)"),
      maxColor: z.string().optional().describe("For gradient: color at maximum value (hex)"),
      midColor: z.string().optional().describe("For gradient: optional mid-point color (hex)"),
    },
    async ({
      pageId, visualId, property, formatType,
      entity, property2, isMeasure,
      rules, defaultColor,
      minColor, maxColor, midColor,
    }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      if (!visual.visual.visualContainerObjects) visual.visual.visualContainerObjects = {};
      const container = visual.visual.visualContainerObjects as Record<string, unknown[]>;

      if (formatType === "clear") {
        delete container[property];
        ctx.project.saveVisual(pageId, visualId, visual);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, cleared: property }) }],
        };
      }

      if (!entity || !property2) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "entity and property2 are required for rules and gradient" }) }],
        };
      }

      // Build the field expression — columns must use Aggregation (Sum) not raw Column,
      // as table/matrix visuals project aggregated values and a raw Column adds an invalid projection.
      const fieldExpr = isMeasure
        ? { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property2 } }
        : { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Entity: entity } }, Property: property2 } }, Function: 0 } };

      if (formatType === "rules") {
        if (!rules || rules.length === 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "rules array is required for formatType=rules" }) }],
          };
        }

        const cases = rules.map((rule) => {
          const litValue =
            typeof rule.value === "number" ? `${rule.value}D` : `'${rule.value}'`;
          return {
            Condition: {
              Comparison: {
                ComparisonKind: rule.comparisonKind,
                Left: fieldExpr,
                Right: { Literal: { Value: litValue } },
              },
            },
            Value: { Literal: { Value: `'${rule.color}'` } },
          };
        });

        const colorExpr = {
          Conditional: {
            Cases: cases,
            Default: { Literal: { Value: `'${defaultColor ?? "#FFFFFF"}'` } },
          },
        };

        // Rules: apply to visualContainerObjects
        const colorProp = { solid: { color: { expr: colorExpr } } };
        const targetKey = property === "background" ? "background" : "title";
        const colorPropKey = property === "background" ? "color" : "fontColor";

        const existingArr = container[targetKey];
        if (Array.isArray(existingArr) && existingArr.length > 0) {
          const item = existingArr[0] as { properties: Record<string, unknown> };
          item.properties = item.properties ?? {};
          if (property === "background") {
            item.properties.show = { expr: { Literal: { Value: "true" } } };
          }
          item.properties[colorPropKey] = colorProp;
        } else {
          const props: Record<string, unknown> = { [colorPropKey]: colorProp };
          if (property === "background") {
            props.show = { expr: { Literal: { Value: "true" } } };
          }
          container[targetKey] = [{ properties: props }];
        }
      } else {
        // gradient — uses FillRule in objects.values (not visualContainerObjects)
        if (!minColor || !maxColor) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "minColor and maxColor are required for formatType=gradient" }) }],
          };
        }

        // Build the queryRef for the selector metadata
        const queryRef = isMeasure
          ? `${entity}.${property2}`
          : `Sum(${entity}.${property2})`;

        // Build linearGradient (2 or 3 point)
        const gradientKey = midColor ? "linearGradient3" : "linearGradient2";
        const gradientDef: Record<string, unknown> = {
          min: { color: { Literal: { Value: `'${minColor}'` } } },
          max: { color: { Literal: { Value: `'${maxColor}'` } } },
          nullColoringStrategy: { strategy: { Literal: { Value: "'asZero'" } } },
        };
        if (midColor) {
          gradientDef.mid = { color: { Literal: { Value: `'${midColor}'` } } };
        }

        const fillRuleExpr = {
          FillRule: {
            Input: fieldExpr,
            FillRule: { [gradientKey]: gradientDef },
          },
        };

        const colorPropKey = property === "background" ? "backColor" : "fontColor";

        if (!visual.visual.objects) visual.visual.objects = {};
        const objects = visual.visual.objects as Record<string, unknown[]>;

        const valuesEntry = {
          properties: {
            [colorPropKey]: {
              solid: { color: { expr: fillRuleExpr } },
            },
          },
          selector: {
            data: [{ dataViewWildcard: { matchingOption: 1 } }],
            metadata: queryRef,
          },
        };

        if (!objects.values) {
          objects.values = [valuesEntry];
        } else {
          objects.values.push(valuesEntry);
        }
      }

      ctx.project.saveVisual(pageId, visualId, visual);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, property, formatType, entity, field: property2 }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: apply_theme
  // ============================================================
  server.tool(
    "apply_theme",
    `Apply a named theme to all visuals on a page. Available themes: ${Object.keys(THEME_PRESETS).join(", ")}. Applies container formatting, and optionally data colors, to every visual on the page in one call.`,
    {
      pageId: z.string().describe("The page ID"),
      theme: z
        .enum(["dark", "light", "corporate", "blue-purple"])
        .describe("Theme preset name"),
      applyDataColors: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to apply theme data colors to chart visuals"),
    },
    async ({ pageId, theme, applyDataColors: applyColors }) => {
      const preset = THEME_PRESETS[theme];
      if (!preset) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: `Unknown theme: ${theme}` }),
            },
          ],
        };
      }

      const chartTypes = new Set([
        "barChart", "clusteredBarChart", "hundredPercentStackedBarChart",
        "columnChart", "clusteredColumnChart", "hundredPercentStackedColumnChart",
        "lineChart", "areaChart", "stackedAreaChart", "hundredPercentStackedAreaChart",
        "lineClusteredColumnComboChart", "lineStackedColumnComboChart",
        "ribbonChart", "waterfallChart", "scatterChart",
        "pieChart", "donutChart", "treemap", "funnel",
      ]);

      const visualIds = ctx.project.listVisualIds(pageId);
      let formatted = 0;

      for (const vid of visualIds) {
        const visual = ctx.project.getVisual(pageId, vid);
        const vType = visual.visual.visualType;

        // Skip non-data visuals — they have their own styling
        if (NO_DATA_VISUAL_TYPES.has(vType)) continue;

        const containerFmt =
          vType === "slicer" && preset.slicerContainerFormat
            ? preset.slicerContainerFormat
            : preset.containerFormat;

        if (!visual.visual.visualContainerObjects) visual.visual.visualContainerObjects = {};
        applyFormattingToTarget(
          visual.visual.visualContainerObjects as Record<string, unknown>,
          containerFmt
        );

        if (preset.chartVisualFormat && chartTypes.has(vType)) {
          if (!visual.visual.objects) visual.visual.objects = {};
          applyFormattingToTarget(
            visual.visual.objects as Record<string, unknown>,
            preset.chartVisualFormat
          );
        }

        if (applyColors && preset.dataColors && chartTypes.has(vType)) {
          const colors = preset.dataColors.map((c) => ({ color: c }));
          applyDataColors(visual, colors);
        }

        ctx.project.saveVisual(pageId, vid, visual);
        formatted++;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, pageId, theme, visualsFormatted: formatted }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: set_visual_sort
  // ============================================================
  server.tool(
    "set_visual_sort",
    "Set the sort order of a visual. Overrides the default auto-sort. Use Table[Column] shorthand for field references.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      sort: z.array(z.object({
        field: z.string().describe("Field to sort by in Table[Column] format (e.g. 'Sales[Revenue]')"),
        type: z.enum(["column", "measure", "aggregation"]).default("column")
          .describe("Field type: column, measure, or aggregation"),
        aggregation: z.string().optional().describe("Aggregation function if type=aggregation (Sum, Avg, Count, Min, Max)"),
        direction: z.enum(["Ascending", "Descending"]).default("Descending")
          .describe("Sort direction"),
      })).describe("Sort fields in priority order"),
      isDefaultSort: z.boolean().optional().default(false)
        .describe("Whether this is the default sort (true = can be overridden by user)"),
    },
    async ({ pageId, visualId, sort, isDefaultSort }) => {
      const visual = ctx.project.getVisual(pageId, visualId);

      // Import parseFieldSpec to reuse the field parsing logic
      // We need to build FieldRef objects from the sort spec
      const sortEntries = sort.map((s) => {
        // Parse field shorthand
        const match = s.field.match(/^(.+)\[(.+)\]$/);
        if (!match) {
          throw new Error(`Invalid field: "${s.field}". Expected Table[Column] format.`);
        }
        const entity = match[1].trim();
        const property = match[2].trim();

        let field: FieldRef;
        if (s.type === "measure") {
          field = {
            Measure: {
              Expression: { SourceRef: { Entity: entity } },
              Property: property,
            },
          };
        } else if (s.type === "aggregation") {
          const aggMap: Record<string, number> = { Sum: 0, Avg: 1, Count: 2, Min: 3, Max: 4, CountNonNull: 5, Median: 6, StandardDeviation: 7, Variance: 8 };
          const func = aggMap[s.aggregation || "Sum"] ?? 0;
          field = {
            Aggregation: {
              Expression: {
                Column: {
                  Expression: { SourceRef: { Entity: entity } },
                  Property: property,
                },
              },
              Function: func,
            },
          };
        } else {
          field = {
            Column: {
              Expression: { SourceRef: { Entity: entity } },
              Property: property,
            },
          };
        }

        return { field, direction: s.direction };
      });

      // Set the sort definition on the visual's query
      if (!visual.visual.query) {
        throw new Error("Visual has no query — cannot set sort on visuals without data bindings.");
      }

      visual.visual.query.sortDefinition = {
        sort: sortEntries,
        ...(isDefaultSort ? { isDefaultSort: true } : {}),
      };

      ctx.project.saveVisual(pageId, visualId, visual);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            pageId,
            visualId,
            sortFields: sort.map((s) => `${s.field} ${s.direction}`),
          }),
        }],
      };
    }
  );
}
