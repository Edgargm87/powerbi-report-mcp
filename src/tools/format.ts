import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applyFormattingToTarget, applyDataColors } from "../helpers/formatting.js";
import { validateFormatTypos } from "../helpers/themeIndex.js";
import { resolvePageId } from "../helpers/resolvePage.js";
import { invalidateScope } from "../helpers/readCache.js";
import { FormatCategorySchema, DataColorSchema, NO_DATA_VISUAL_TYPES, parseFieldSpec, beginBindingAutoCorrections, drainBindingAutoCorrections } from "../helpers/createVisual.js";
import { getInventoryForProject, resolveValidationMode } from "../helpers/bindingValidation.js";
import { THEME_PRESETS } from "../helpers/defaults.js";
import type { ServerContext } from "../context.js";
import { requireProject } from "../context.js";
import { fail } from "../helpers/mcpResult.js";

// Categories that belong in visualContainerObjects (container chrome)
const CONTAINER_CATEGORIES = new Set([
  "title", "subTitle", "background", "border", "padding",
  "dropShadow", "visualHeader", "visualHeaderTooltip",
]);

export function registerFormatTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: pbir_set_visual_title
  // ============================================================
  server.tool(
    "pbir_set_visual_title",
    "Set or update the title of a visual. Can set text, visibility, font, size, alignment.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualId: z.string().describe("The visual ID"),
      title: z.string().optional(),
      show: z.boolean().optional(),
      fontSize: z.number().optional(),
      fontFamily: z.string().optional().describe("PBI font stack"),
      alignment: z.enum(["left", "center", "right"]).optional(),
      titleWrap: z.boolean().optional(),
    },
    {"idempotentHint":true,"openWorldHint":false},
    async ({ pageId, visualId, title, show, fontSize, fontFamily, alignment, titleWrap }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
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

      invalidateScope(`page:${pageId}`);
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
  // TOOL: pbir_format_visual
  // ============================================================
  server.tool(
    "pbir_format_visual",
    "Format visual properties. Auto-routes title/background/border/padding/dropShadow/visualHeader to container, others to visual; override with target='visual'|'container'. Call `pbir_lookup_theme_property` for valid category/property names per visualType. Gotchas: slicer uses `textSize`, not `fontSize` (items/header); waterfall uses `sentimentColors`, not `dataPoint`.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
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
    },
    {"openWorldHint":false},
    async ({ pageId, visualId, formatting, target }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const visual = ctx.project.getVisual(pageId, visualId);

      // Cheap typo catcher — flag misspelled category/property names against
      // the bundled schema. Always-on, no opt-out. Unknown visualType → no-op.
      const typoIssues = validateFormatTypos(visual.visual.visualType, formatting);
      if (typoIssues.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: "format_typo",
                  issues: typoIssues.map(({ category, prop, didYouMean }) => ({
                    cat: category,
                    ...(prop ? { prop } : {}),
                    didYouMean,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
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

      invalidateScope(`page:${pageId}`);
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
  // TOOL: pbir_set_datapoint_colors
  // ============================================================
  server.tool(
    "pbir_set_datapoint_colors",
    "Set data point colors. Series-based charts use metadata mode. Category-based (no Series) requires categoryEntity+categoryProperty.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualId: z.string().describe("The visual ID"),
      colors: z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, z.array(DataColorSchema)).describe("[{seriesName, color}]"),
      categoryEntity: z.string().optional().describe("Required for category-based charts"),
      categoryProperty: z.string().optional().describe("Required for category-based charts"),
      defaultTransparency: z.number().optional(),
    },
    {"openWorldHint":false},
    async ({ pageId, visualId, colors, categoryEntity, categoryProperty, defaultTransparency }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const visual = ctx.project.getVisual(pageId, visualId);
      applyDataColors(visual, colors, defaultTransparency, categoryEntity, categoryProperty);
      ctx.project.saveVisual(pageId, visualId, visual);
      invalidateScope(`page:${pageId}`);
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
  // TOOL: pbir_set_conditional_format
  // ============================================================
  server.tool(
    "pbir_set_conditional_format",
    "Apply conditional formatting to a visual container background or title font. formatType: rules / gradient / clear. ComparisonKind: 0=Eq,1=GT,2=GTE,3=LT,4=LTE,5=NEq.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualId: z.string().describe("The visual ID"),
      property: z.enum(["background", "title"]).default("background"),
      formatType: z.enum(["rules", "gradient", "clear"]),
      entity: z.string().optional().describe("Driving table name"),
      property2: z.string().optional().describe("Driving column/measure name"),
      isMeasure: z.boolean().optional().default(true),
      rules: z
        .array(
          z.object({
            comparisonKind: z.number(),
            value: z.union([z.number(), z.string()]),
            color: z.string().describe("Hex"),
          })
        )
        .optional()
        .describe("Ordered list (first match wins)"),
      defaultColor: z.string().optional(),
      minColor: z.string().optional().describe("gradient"),
      maxColor: z.string().optional().describe("gradient"),
      midColor: z.string().optional().describe("gradient (optional 3-stop)"),
    },
    {"openWorldHint":false},
    async ({
      pageId, visualId, property, formatType,
      entity, property2, isMeasure,
      rules, defaultColor,
      minColor, maxColor, midColor,
    }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const rp = resolvePageId(ctx.project, pageId);
      if (!rp.resolved) return rp.errorResponse;
      pageId = rp.pageId;
      const visual = ctx.project.getVisual(pageId, visualId);
      if (!visual.visual.visualContainerObjects) visual.visual.visualContainerObjects = {};
      const container = visual.visual.visualContainerObjects as Record<string, unknown[]>;

      if (formatType === "clear") {
        delete container[property];
        ctx.project.saveVisual(pageId, visualId, visual);
        invalidateScope(`page:${pageId}`);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, cleared: property }) }],
        };
      }

      if (!entity || !property2) {
        return fail("entity and property2 are required for rules and gradient");
      }

      // Build the field expression — columns must use Aggregation (Sum) not raw Column,
      // as table/matrix visuals project aggregated values and a raw Column adds an invalid projection.
      const fieldExpr = isMeasure
        ? { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property2 } }
        : { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Entity: entity } }, Property: property2 } }, Function: 0 } };

      if (formatType === "rules") {
        if (!rules || rules.length === 0) {
          return fail("rules array is required for formatType=rules");
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
          return fail("minColor and maxColor are required for formatType=gradient");
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

      invalidateScope(`page:${pageId}`);
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
  // TOOL: pbir_apply_theme
  // ============================================================
  server.tool(
    "pbir_apply_theme",
    `Apply a named theme preset to all visuals on a page. Themes: ${Object.keys(THEME_PRESETS).join(", ")}.`,
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      theme: z.enum(["dark", "light", "corporate", "blue-purple"]),
      applyDataColors: z.boolean().optional().default(true),
    },
    {"openWorldHint":false},
    async ({ pageId, theme, applyDataColors: applyColors }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const rp = resolvePageId(ctx.project, pageId);
      if (!rp.resolved) return rp.errorResponse;
      pageId = rp.pageId;
      const preset = THEME_PRESETS[theme];
      if (!preset) {
        return fail(`Unknown theme: ${theme}`);
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

        invalidateScope(`page:${pageId}`);
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
  // TOOL: pbir_set_visual_sort
  // ============================================================
  server.tool(
    "pbir_set_visual_sort",
    "Set the sort order of a visual. Overrides the auto-sort. Use Table[Column] for field refs.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      visualId: z.string().describe("The visual ID"),
      sort: z.array(z.object({
        field: z.string().describe("Table[Column]"),
        type: z.enum(["column", "measure", "aggregation"]).default("column"),
        aggregation: z.string().optional().describe("Sum/Avg/Count/Min/Max if type=aggregation"),
        direction: z.enum(["Ascending", "Descending"]).default("Descending"),
      })).describe("Priority order"),
      isDefaultSort: z.boolean().optional().default(false).describe("true=user can override"),
    },
    {"openWorldHint":false},
    async ({ pageId, visualId, sort, isDefaultSort }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const rp = resolvePageId(ctx.project, pageId);
      if (!rp.resolved) return rp.errorResponse;
      pageId = rp.pageId;
      const visual = ctx.project.getVisual(pageId, visualId);

      // Resolve model inventory so parseFieldSpec can auto-correct measure
      // entities to their home table (closes v0.9.3 audit follow-up — same
      // bug class as the original parseFieldSpec fix, just at the sort site).
      const { inventory } = getInventoryForProject(ctx.project, resolveValidationMode(undefined));

      // Build FieldRef objects via parseFieldSpec — same path as bindings,
      // including measure home-table auto-resolution when unambiguous.
      beginBindingAutoCorrections();
      const sortEntries = sort.map((s) => {
        const field = parseFieldSpec(
          { field: s.field, type: s.type, aggregation: s.aggregation },
          inventory
        );
        return { field, direction: s.direction };
      });
      const corrections = drainBindingAutoCorrections();

      // Set the sort definition on the visual's query
      if (!visual.visual.query) {
        throw new Error("Visual has no query — cannot set sort on visuals without data bindings.");
      }

      visual.visual.query.sortDefinition = {
        sort: sortEntries,
        ...(isDefaultSort ? { isDefaultSort: true } : {}),
      };

      ctx.project.saveVisual(pageId, visualId, visual);

      invalidateScope(`page:${pageId}`);
      const response: Record<string, unknown> = {
        success: true,
        pageId,
        visualId,
        sortFields: sort.map((s) => `${s.field} ${s.direction}`),
      };
      if (corrections.length > 0) response.bindingAutoCorrections = corrections;
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response),
        }],
      };
    }
  );
}
