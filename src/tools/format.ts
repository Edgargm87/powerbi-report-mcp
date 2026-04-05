import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applyFormattingToTarget, applyDataColors } from "../helpers/formatting.js";
import { FormatCategorySchema, DataColorSchema, NO_DATA_VISUAL_TYPES } from "../helpers/createVisual.js";
import { THEME_PRESETS } from "../helpers/defaults.js";
import type { ServerContext } from "../context.js";

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
    "Format visual properties. target='visual' for axes/legend/labels/lineStyles/etc. target='container' for title/background/border/padding/dropShadow/visualHeader. Colors starting with # auto-wrap. Numbers use D suffix.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      formatting: z
        .array(FormatCategorySchema)
        .describe("Array of formatting categories and their properties to set"),
      target: z
        .enum(["visual", "container"])
        .optional()
        .default("visual")
        .describe(
          "'visual' sets visual.objects, 'container' sets visual.visualContainerObjects"
        ),
    },
    async ({ pageId, visualId, formatting, target }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      const targetObj =
        target === "container"
          ? (visual.visual.visualContainerObjects ??= {})
          : (visual.visual.objects ??= {});
      applyFormattingToTarget(targetObj as Record<string, unknown>, formatting);
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
    "Set data point colors for specific series/measures in a visual.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      colors: z.array(DataColorSchema).describe("Array of color assignments for data points"),
      defaultTransparency: z
        .number()
        .optional()
        .describe("Default transparency for all data points (0-100)"),
    },
    async ({ pageId, visualId, colors, defaultTransparency }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      applyDataColors(visual, colors, defaultTransparency);
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
    `Apply conditional (data-driven) formatting to a visual's container background or font color.
- **rules**: colour changes based on measure/column value comparisons (e.g. green if sales > 10000, red otherwise)
- **gradient**: linear colour scale from minColor to maxColor based on a measure/column
- **clear**: remove all conditional formatting for the target property

Applies to visualContainerObjects (container-level — affects the whole visual card background or title font).

ComparisonKind values: 0=Equal, 1=GreaterThan, 2=GreaterThanOrEqual, 3=LessThan, 4=LessThanOrEqual, 5=NotEqual`,
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

      // Build the field expression
      const fieldExpr = isMeasure
        ? { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property2 } }
        : { Column: { Expression: { SourceRef: { Entity: entity } }, Property: property2 } };

      let colorExpr: unknown;

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

        colorExpr = {
          Conditional: {
            Cases: cases,
            Default: { Literal: { Value: `'${defaultColor ?? "#FFFFFF"}'` } },
          },
        };
      } else {
        // gradient
        if (!minColor || !maxColor) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "minColor and maxColor are required for formatType=gradient" }) }],
          };
        }

        const midEntry = midColor
          ? {
              Mid: {
                Field: fieldExpr,
                ForeColor: { expr: { Literal: { Value: `'${midColor}'` } } },
              },
            }
          : {};

        colorExpr = {
          ColorLinear: {
            Min: {
              Field: fieldExpr,
              ForeColor: { expr: { Literal: { Value: `'${minColor}'` } } },
            },
            ...midEntry,
            Max: {
              Field: fieldExpr,
              ForeColor: { expr: { Literal: { Value: `'${maxColor}'` } } },
            },
          },
        };
      }

      // Apply to the target property
      const colorProp = {
        solid: { color: { expr: colorExpr } },
      };

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
}
