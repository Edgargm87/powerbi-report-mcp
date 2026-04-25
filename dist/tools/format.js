"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFormatTools = registerFormatTools;
const zod_1 = require("zod");
const formatting_js_1 = require("../helpers/formatting.js");
const themeIndex_js_1 = require("../helpers/themeIndex.js");
const resolvePage_js_1 = require("../helpers/resolvePage.js");
const readCache_js_1 = require("../helpers/readCache.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
const defaults_js_1 = require("../helpers/defaults.js");
// Categories that belong in visualContainerObjects (container chrome)
const CONTAINER_CATEGORIES = new Set([
    "title", "subTitle", "background", "border", "padding",
    "dropShadow", "visualHeader", "visualHeaderTooltip",
]);
function registerFormatTools(server, ctx) {
    // ============================================================
    // TOOL: set_visual_title
    // ============================================================
    server.tool("set_visual_title", "Set or update the title of a visual. Can set text, visibility, font, size, alignment.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID"),
        title: zod_1.z.string().optional(),
        show: zod_1.z.boolean().optional(),
        fontSize: zod_1.z.number().optional(),
        fontFamily: zod_1.z.string().optional().describe("PBI font stack"),
        alignment: zod_1.z.enum(["left", "center", "right"]).optional(),
        titleWrap: zod_1.z.boolean().optional(),
    }, { "idempotentHint": true, "openWorldHint": false }, async ({ pageId, visualId, title, show, fontSize, fontFamily, alignment, titleWrap }) => {
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("format_visual", "Format visual properties. Auto-routes title/background/border/padding/dropShadow/visualHeader to container, others to visual; override with target='visual'|'container'. Call `lookup_theme_property` for valid category/property names per visualType. Gotchas: slicer uses `textSize`, not `fontSize` (items/header); waterfall uses `sentimentColors`, not `dataPoint`.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID"),
        formatting: zod_1.z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, zod_1.z.array(createVisual_js_1.FormatCategorySchema))
            .describe("Array of formatting categories and their properties to set"),
        target: zod_1.z
            .enum(["visual", "container", "auto"])
            .optional()
            .default("auto")
            .describe("'auto' (default) routes container categories (title/background/border/padding/dropShadow/visualHeader) to visualContainerObjects and everything else to objects. Use 'visual' or 'container' to force."),
    }, { "openWorldHint": false }, async ({ pageId, visualId, formatting, target }) => {
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const visual = ctx.project.getVisual(pageId, visualId);
        // Cheap typo catcher — flag misspelled category/property names against
        // the bundled schema. Always-on, no opt-out. Unknown visualType → no-op.
        const typoIssues = (0, themeIndex_js_1.validateFormatTypos)(visual.visual.visualType, formatting);
        if (typoIssues.length > 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "format_typo",
                            issues: typoIssues.map(({ category, prop, didYouMean }) => ({
                                cat: category,
                                ...(prop ? { prop } : {}),
                                didYouMean,
                            })),
                        }, null, 2),
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
                (0, formatting_js_1.applyFormattingToTarget)(containerObj, containerFmt);
            }
            if (visualFmt.length > 0) {
                const visualObj = (visual.visual.objects ??= {});
                (0, formatting_js_1.applyFormattingToTarget)(visualObj, visualFmt);
            }
        }
        else {
            const targetObj = target === "container"
                ? (visual.visual.visualContainerObjects ??= {})
                : (visual.visual.objects ??= {});
            (0, formatting_js_1.applyFormattingToTarget)(targetObj, formatting);
        }
        ctx.project.saveVisual(pageId, visualId, visual);
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("set_datapoint_colors", "Set data point colors. Series-based charts use metadata mode. Category-based (no Series) requires categoryEntity+categoryProperty.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID"),
        colors: zod_1.z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, zod_1.z.array(createVisual_js_1.DataColorSchema)).describe("[{seriesName, color}]"),
        categoryEntity: zod_1.z.string().optional().describe("Required for category-based charts"),
        categoryProperty: zod_1.z.string().optional().describe("Required for category-based charts"),
        defaultTransparency: zod_1.z.number().optional(),
    }, { "openWorldHint": false }, async ({ pageId, visualId, colors, categoryEntity, categoryProperty, defaultTransparency }) => {
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const visual = ctx.project.getVisual(pageId, visualId);
        (0, formatting_js_1.applyDataColors)(visual, colors, defaultTransparency, categoryEntity, categoryProperty);
        ctx.project.saveVisual(pageId, visualId, visual);
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("set_conditional_format", "Apply conditional formatting to a visual container background or title font. formatType: rules / gradient / clear. ComparisonKind: 0=Eq,1=GT,2=GTE,3=LT,4=LTE,5=NEq.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID"),
        property: zod_1.z.enum(["background", "title"]).default("background"),
        formatType: zod_1.z.enum(["rules", "gradient", "clear"]),
        entity: zod_1.z.string().optional().describe("Driving table name"),
        property2: zod_1.z.string().optional().describe("Driving column/measure name"),
        isMeasure: zod_1.z.boolean().optional().default(true),
        rules: zod_1.z
            .array(zod_1.z.object({
            comparisonKind: zod_1.z.number(),
            value: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]),
            color: zod_1.z.string().describe("Hex"),
        }))
            .optional()
            .describe("Ordered list (first match wins)"),
        defaultColor: zod_1.z.string().optional(),
        minColor: zod_1.z.string().optional().describe("gradient"),
        maxColor: zod_1.z.string().optional().describe("gradient"),
        midColor: zod_1.z.string().optional().describe("gradient (optional 3-stop)"),
    }, { "openWorldHint": false }, async ({ pageId, visualId, property, formatType, entity, property2, isMeasure, rules, defaultColor, minColor, maxColor, midColor, }) => {
        const rp = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!rp.resolved)
            return rp.errorResponse;
        pageId = rp.pageId;
        const visual = ctx.project.getVisual(pageId, visualId);
        if (!visual.visual.visualContainerObjects)
            visual.visual.visualContainerObjects = {};
        const container = visual.visual.visualContainerObjects;
        if (formatType === "clear") {
            delete container[property];
            ctx.project.saveVisual(pageId, visualId, visual);
            (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
        }
        else {
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
            const gradientDef = {
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
            if (!visual.visual.objects)
                visual.visual.objects = {};
            const objects = visual.visual.objects;
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
            }
            else {
                objects.values.push(valuesEntry);
            }
        }
        ctx.project.saveVisual(pageId, visualId, visual);
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("apply_theme", `Apply a named theme preset to all visuals on a page. Themes: ${Object.keys(defaults_js_1.THEME_PRESETS).join(", ")}.`, {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        theme: zod_1.z.enum(["dark", "light", "corporate", "blue-purple"]),
        applyDataColors: zod_1.z.boolean().optional().default(true),
    }, { "openWorldHint": false }, async ({ pageId, theme, applyDataColors: applyColors }) => {
        const rp = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!rp.resolved)
            return rp.errorResponse;
        pageId = rp.pageId;
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
            (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    // ============================================================
    // TOOL: set_visual_sort
    // ============================================================
    server.tool("set_visual_sort", "Set the sort order of a visual. Overrides the auto-sort. Use Table[Column] for field refs.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID"),
        sort: zod_1.z.array(zod_1.z.object({
            field: zod_1.z.string().describe("Table[Column]"),
            type: zod_1.z.enum(["column", "measure", "aggregation"]).default("column"),
            aggregation: zod_1.z.string().optional().describe("Sum/Avg/Count/Min/Max if type=aggregation"),
            direction: zod_1.z.enum(["Ascending", "Descending"]).default("Descending"),
        })).describe("Priority order"),
        isDefaultSort: zod_1.z.boolean().optional().default(false).describe("true=user can override"),
    }, { "openWorldHint": false }, async ({ pageId, visualId, sort, isDefaultSort }) => {
        const rp = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!rp.resolved)
            return rp.errorResponse;
        pageId = rp.pageId;
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
            let field;
            if (s.type === "measure") {
                field = {
                    Measure: {
                        Expression: { SourceRef: { Entity: entity } },
                        Property: property,
                    },
                };
            }
            else if (s.type === "aggregation") {
                const aggMap = { Sum: 0, Avg: 1, Count: 2, Min: 3, Max: 4, CountNonNull: 5, Median: 6, StandardDeviation: 7, Variance: 8 };
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
            }
            else {
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    });
}
