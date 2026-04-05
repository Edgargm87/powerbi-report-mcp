"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFormatTools = registerFormatTools;
const zod_1 = require("zod");
const formatting_js_1 = require("../helpers/formatting.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
const defaults_js_1 = require("../helpers/defaults.js");
function registerFormatTools(server, ctx) {
    // ============================================================
    // TOOL: set_visual_title
    // ============================================================
    server.tool("set_visual_title", "Set or update the title of a visual. Can set text, visibility, font, size, alignment.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        title: zod_1.z.string().optional().describe("The title text to display"),
        show: zod_1.z.boolean().optional().describe("Whether to show the title (default true)"),
        fontSize: zod_1.z.number().optional().describe("Font size (e.g. 8, 12, 14)"),
        fontFamily: zod_1.z
            .string()
            .optional()
            .describe("Font family (e.g. \"'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif\")"),
        alignment: zod_1.z.enum(["left", "center", "right"]).optional().describe("Title alignment"),
        titleWrap: zod_1.z.boolean().optional().describe("Whether to wrap the title text"),
    }, async ({ pageId, visualId, title, show, fontSize, fontFamily, alignment, titleWrap }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        if (!visual.visual.visualContainerObjects) {
            visual.visual.visualContainerObjects = {};
        }
        const titleProps = {};
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
        const existing = visual.visual.visualContainerObjects.title;
        if (Array.isArray(existing) && existing.length > 0) {
            const existingProps = existing[0].properties || {};
            existing[0].properties = {
                ...existingProps,
                ...titleProps,
            };
        }
        else {
            visual.visual.visualContainerObjects.title = [
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
    });
    // ============================================================
    // TOOL: format_visual
    // ============================================================
    server.tool("format_visual", "Format visual properties. target='visual' for axes/legend/labels/lineStyles/etc. target='container' for title/background/border/padding/dropShadow/visualHeader. Colors starting with # auto-wrap. Numbers use D suffix.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        formatting: zod_1.z
            .array(createVisual_js_1.FormatCategorySchema)
            .describe("Array of formatting categories and their properties to set"),
        target: zod_1.z
            .enum(["visual", "container"])
            .optional()
            .default("visual")
            .describe("'visual' sets visual.objects, 'container' sets visual.visualContainerObjects"),
    }, async ({ pageId, visualId, formatting, target }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        const targetObj = target === "container"
            ? (visual.visual.visualContainerObjects ??= {})
            : (visual.visual.objects ??= {});
        (0, formatting_js_1.applyFormattingToTarget)(targetObj, formatting);
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
    });
    // ============================================================
    // TOOL: set_datapoint_colors
    // ============================================================
    server.tool("set_datapoint_colors", "Set data point colors for specific series/measures in a visual.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        colors: zod_1.z.array(createVisual_js_1.DataColorSchema).describe("Array of color assignments for data points"),
        defaultTransparency: zod_1.z
            .number()
            .optional()
            .describe("Default transparency for all data points (0-100)"),
    }, async ({ pageId, visualId, colors, defaultTransparency }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        (0, formatting_js_1.applyDataColors)(visual, colors, defaultTransparency);
        ctx.project.saveVisual(pageId, visualId, visual);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, pageId, visualId, colorCount: colors.length }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: set_conditional_format
    // ============================================================
    server.tool("set_conditional_format", `Apply conditional (data-driven) formatting to a visual's container background or font color.
- **rules**: colour changes based on measure/column value comparisons (e.g. green if sales > 10000, red otherwise)
- **gradient**: linear colour scale from minColor to maxColor based on a measure/column
- **clear**: remove all conditional formatting for the target property

Applies to visualContainerObjects (container-level — affects the whole visual card background or title font).

ComparisonKind values: 0=Equal, 1=GreaterThan, 2=GreaterThanOrEqual, 3=LessThan, 4=LessThanOrEqual, 5=NotEqual`, {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        property: zod_1.z
            .enum(["background", "title"])
            .default("background")
            .describe("Which property to apply conditional formatting to"),
        formatType: zod_1.z
            .enum(["rules", "gradient", "clear"])
            .describe("Type of conditional formatting"),
        // Shared: measure/column driving the format
        entity: zod_1.z.string().optional().describe("Table name of the driving field (e.g. 'Sales')"),
        property2: zod_1.z.string().optional().describe("Column or measure name of the driving field (e.g. 'KPI Status')"),
        isMeasure: zod_1.z.boolean().optional().default(true).describe("true if driving field is a DAX measure, false for column"),
        // Rules
        rules: zod_1.z
            .array(zod_1.z.object({
            comparisonKind: zod_1.z.number().describe("0=Equal,1=GT,2=GTE,3=LT,4=LTE,5=NotEqual"),
            value: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).describe("Comparison value (number or string)"),
            color: zod_1.z.string().describe("Hex color when condition is true (e.g. '#00B050')"),
        }))
            .optional()
            .describe("For rules: ordered list of comparison → color rules (first match wins)"),
        defaultColor: zod_1.z.string().optional().describe("Fallback color when no rule matches (hex)"),
        // Gradient
        minColor: zod_1.z.string().optional().describe("For gradient: color at minimum value (hex)"),
        maxColor: zod_1.z.string().optional().describe("For gradient: color at maximum value (hex)"),
        midColor: zod_1.z.string().optional().describe("For gradient: optional mid-point color (hex)"),
    }, async ({ pageId, visualId, property, formatType, entity, property2, isMeasure, rules, defaultColor, minColor, maxColor, midColor, }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        if (!visual.visual.visualContainerObjects)
            visual.visual.visualContainerObjects = {};
        const container = visual.visual.visualContainerObjects;
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
        let colorExpr;
        if (formatType === "rules") {
            if (!rules || rules.length === 0) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ success: false, error: "rules array is required for formatType=rules" }) }],
                };
            }
            const cases = rules.map((rule) => {
                const litValue = typeof rule.value === "number" ? `${rule.value}D` : `'${rule.value}'`;
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
        }
        else {
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
            const item = existingArr[0];
            item.properties = item.properties ?? {};
            if (property === "background") {
                item.properties.show = { expr: { Literal: { Value: "true" } } };
            }
            item.properties[colorPropKey] = colorProp;
        }
        else {
            const props = { [colorPropKey]: colorProp };
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
    });
    // ============================================================
    // TOOL: apply_theme
    // ============================================================
    server.tool("apply_theme", `Apply a named theme to all visuals on a page. Available themes: ${Object.keys(defaults_js_1.THEME_PRESETS).join(", ")}. Applies container formatting, and optionally data colors, to every visual on the page in one call.`, {
        pageId: zod_1.z.string().describe("The page ID"),
        theme: zod_1.z
            .enum(["dark", "light", "corporate", "blue-purple"])
            .describe("Theme preset name"),
        applyDataColors: zod_1.z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to apply theme data colors to chart visuals"),
    }, async ({ pageId, theme, applyDataColors: applyColors }) => {
        const preset = defaults_js_1.THEME_PRESETS[theme];
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
            if (createVisual_js_1.NO_DATA_VISUAL_TYPES.has(vType))
                continue;
            const containerFmt = vType === "slicer" && preset.slicerContainerFormat
                ? preset.slicerContainerFormat
                : preset.containerFormat;
            if (!visual.visual.visualContainerObjects)
                visual.visual.visualContainerObjects = {};
            (0, formatting_js_1.applyFormattingToTarget)(visual.visual.visualContainerObjects, containerFmt);
            if (preset.chartVisualFormat && chartTypes.has(vType)) {
                if (!visual.visual.objects)
                    visual.visual.objects = {};
                (0, formatting_js_1.applyFormattingToTarget)(visual.visual.objects, preset.chartVisualFormat);
            }
            if (applyColors && preset.dataColors && chartTypes.has(vType)) {
                const colors = preset.dataColors.map((c) => ({ color: c }));
                (0, formatting_js_1.applyDataColors)(visual, colors);
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
    });
}
