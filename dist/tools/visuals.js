"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVisualTools = registerVisualTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
const model_usage_js_1 = require("../model-usage.js");
const bindingValidation_js_1 = require("../helpers/bindingValidation.js");
const extractTitle_js_1 = require("../helpers/extractTitle.js");
function registerVisualTools(server, ctx) {
    // ============================================================
    // TOOL: get_visual_types
    // ============================================================
    server.tool("get_visual_types", "Get a list of available visual types and their data role buckets", {}, async () => {
        return { content: [{ type: "text", text: JSON.stringify(pbir_js_1.VISUAL_BUCKETS, null, 2) }] };
    });
    // ============================================================
    // TOOL: list_visuals
    // ============================================================
    server.tool("list_visuals", "List all visuals on a page. Slim mode (default) returns id, type, x, y, w, h and title if set. Set slim=false for full position object and filter count.", {
        pageId: zod_1.z.string().describe("The page ID"),
        slim: zod_1.z.boolean().optional().default(true).describe("Slim mode (default true) — flat short keys, omits z/tabOrder/filterCount to reduce token usage"),
    }, async ({ pageId, slim }) => {
        const visualIds = ctx.project.listVisualIds(pageId);
        const visuals = visualIds.map((id) => {
            const v = ctx.project.getVisual(pageId, id);
            const titleValue = (0, extractTitle_js_1.extractVisualTitle)(v.visual.visualContainerObjects);
            if (slim) {
                const entry = {
                    id,
                    type: v.visual.visualType,
                    x: v.position.x,
                    y: v.position.y,
                    w: v.position.width,
                    h: v.position.height,
                };
                if (titleValue)
                    entry.title = titleValue;
                return entry;
            }
            return {
                id,
                visualType: v.visual.visualType,
                position: v.position,
                title: titleValue,
                filterCount: v.filterConfig?.filters?.length ?? 0,
            };
        });
        return { content: [{ type: "text", text: JSON.stringify(visuals, null, 2) }] };
    });
    // ============================================================
    // TOOL: get_visual
    // ============================================================
    server.tool("get_visual", "Get visual details. Slim mode (default) returns type, position, bindings summary, title, filterCount. Set slim=false for the full raw PBIR JSON.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        slim: zod_1.z.boolean().optional().default(true).describe("Slim mode (default true) — summary instead of full JSON"),
    }, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ pageId, visualId, slim }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        if (!slim) {
            return { content: [{ type: "text", text: JSON.stringify(visual, null, 2) }] };
        }
        // Extract title
        const titleValue = (0, extractTitle_js_1.extractVisualTitle)(visual.visual.visualContainerObjects);
        // Extract bindings as Table[Field] strings
        const bindings = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const qs = visual.visual.query?.queryState;
        if (qs) {
            for (const [bucket, state] of Object.entries(qs)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const projs = state?.projections ?? [];
                bindings[bucket] = projs.map((p) => {
                    const f = p.field;
                    if (f?.Column)
                        return `${f.Column.Expression?.SourceRef?.Entity}[${f.Column.Property}]`;
                    if (f?.Measure)
                        return `${f.Measure.Expression?.SourceRef?.Entity}[${f.Measure.Property}]`;
                    if (f?.Aggregation?.Expression?.Column) {
                        const col = f.Aggregation.Expression.Column;
                        return `${col.Expression?.SourceRef?.Entity}[${col.Property}]`;
                    }
                    return "(unknown)";
                });
            }
        }
        const result = {
            id: visual.name,
            type: visual.visual.visualType,
            x: visual.position.x,
            y: visual.position.y,
            w: visual.position.width,
            h: visual.position.height,
        };
        if (titleValue)
            result.title = titleValue;
        if (Object.keys(bindings).length > 0)
            result.bindings = bindings;
        result.filterCount = visual.filterConfig?.filters?.length ?? 0;
        // Slicer-specific surface area: mode + selection state.
        // Detection rules:
        //   slicerMode    ← objects.data[0].properties.mode.expr.Literal.Value (strip quotes)
        //                   defaults: slicer→"Dropdown", listSlicer/textSlicer→n/a
        //   multiSelect   ← objects.selection[0].properties.singleSelect.expr.Literal.Value
        //                     "false" → multiSelect=true
        //                     "true"  → multiSelect=false
        //                     absent  → infer from PBI default (Dropdown=false, Basic/listSlicer=true)
        const SLICER_TYPES = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
        const vType = visual.visual.visualType;
        if (SLICER_TYPES.has(vType)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const objs = visual.visual.objects;
            let slicerMode;
            if (vType === "slicer") {
                const modeLit = objs?.data?.[0]?.properties?.mode?.expr?.Literal?.Value;
                if (typeof modeLit === "string") {
                    slicerMode = modeLit.replace(/^'|'$/g, "");
                }
                else {
                    slicerMode = "Dropdown"; // PBI default
                }
                result.slicerMode = slicerMode;
            }
            const singleLit = objs?.selection?.[0]?.properties?.singleSelect?.expr?.Literal?.Value;
            let multiSelect;
            if (singleLit === "true") {
                multiSelect = false;
            }
            else if (singleLit === "false") {
                multiSelect = true;
            }
            else {
                // No explicit setting — apply PBI default for the variant
                multiSelect = vType === "slicer" ? slicerMode !== "Dropdown" : true;
            }
            result.multiSelect = multiSelect;
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    // ============================================================
    // TOOL: add_visual (single + batch mode)
    // ============================================================
    server.tool("add_visual", "Add one or more visuals to a page. Single mode: top-level params. Batch mode: 'visuals' array. Inline containerFormat/visualFormat/dataColors = 0 extra format calls. Chart naming: columnChart=stacked column (Series=stack), barChart=stacked bar (Series=stack), clusteredColumnChart=clustered column, clusteredBarChart=clustered bar. Call get_visual_types for full type list.", {
        pageId: zod_1.z.string().describe("The page ID to add the visual(s) to"),
        // Single mode params
        visualType: zod_1.z.string().optional().describe("Visual type for single mode"),
        x: zod_1.z.number().optional().default(0),
        y: zod_1.z.number().optional().default(0),
        width: zod_1.z.number().optional().default(280),
        height: zod_1.z.number().optional().default(280),
        bindings: zod_1.z.array(createVisual_js_1.BucketBindingSchema).optional(),
        autoFilters: zod_1.z.boolean().optional().default(true),
        slicerMode: zod_1.z.enum(["Basic", "Dropdown"]).optional(),
        multiSelect: zod_1.z
            .boolean()
            .optional()
            .describe("Slicer selection mode (slicer/listSlicer). true=multi-select, false=single-select. Omit for PBI default."),
        shapeType: zod_1.z
            .enum(["rectangle", "rectangleRounded", "line", "tabCutCorner", "tabCutTopCorners", "tabRoundCorner", "tabRoundTopCorners"])
            .optional(),
        shapeRotation: zod_1.z.number().optional().default(0),
        fillColor: zod_1.z.string().optional(),
        textContent: zod_1.z.string().optional(),
        textColor: zod_1.z.string().optional(),
        textAlign: zod_1.z.enum(["left", "center", "right"]).optional(),
        textSize: zod_1.z.number().optional(),
        textBold: zod_1.z.boolean().optional(),
        title: zod_1.z.string().optional(),
        strictBindings: zod_1.z
            .boolean()
            .optional()
            .describe("Binding validation: true=strict (fail on unknown field, default), false=warn (proceed with warnings). Omit for env default (MCP_BINDING_VALIDATION)."),
        containerFormat: zod_1.z.array(createVisual_js_1.FormatCategorySchema).optional().describe("Inline container formatting"),
        visualFormat: zod_1.z.array(createVisual_js_1.FormatCategorySchema).optional().describe("Inline visual formatting"),
        dataColors: zod_1.z.array(createVisual_js_1.DataColorSchema).optional().describe("Inline data point colors"),
        // Image params
        imageUrl: zod_1.z.string().optional().describe("Image URL (image visual only)"),
        imageScaling: zod_1.z.enum(["fit", "fill", "normal"]).optional().describe("Image scaling (default fit)"),
        // actionButton params
        buttonText: zod_1.z.string().optional().describe("Button label (actionButton only)"),
        buttonAction: zod_1.z
            .enum(["pageNavigation", "URL", "bookmark", "back"])
            .optional()
            .describe("Button action type"),
        buttonActionTarget: zod_1.z
            .string()
            .optional()
            .describe("Action target: page ID for pageNavigation, URL for URL, bookmark ID for bookmark"),
        // Batch mode
        visuals: zod_1.z
            .array(createVisual_js_1.VisualSpecSchema)
            .optional()
            .describe("Array of visuals to add (batch mode). When provided, top-level visual params are ignored."),
    }, async (params) => {
        const { pageId } = params;
        const existingVisuals = ctx.project.listVisualIds(pageId);
        let maxZ = 0;
        for (const vid of existingVisuals) {
            const v = ctx.project.getVisual(pageId, vid);
            if (v.position.z > maxZ)
                maxZ = v.position.z;
        }
        let specs;
        if (params.visuals && params.visuals.length > 0) {
            specs = params.visuals;
        }
        else if (params.visualType) {
            specs = [
                {
                    visualType: params.visualType,
                    x: params.x,
                    y: params.y,
                    width: params.width,
                    height: params.height,
                    bindings: params.bindings,
                    autoFilters: params.autoFilters,
                    slicerMode: params.slicerMode,
                    multiSelect: params.multiSelect,
                    shapeType: params.shapeType,
                    shapeRotation: params.shapeRotation,
                    fillColor: params.fillColor,
                    textContent: params.textContent,
                    textColor: params.textColor,
                    textAlign: params.textAlign,
                    textSize: params.textSize,
                    textBold: params.textBold,
                    title: params.title,
                    containerFormat: params.containerFormat,
                    visualFormat: params.visualFormat,
                    dataColors: params.dataColors,
                    imageUrl: params.imageUrl,
                    imageScaling: params.imageScaling,
                    buttonText: params.buttonText,
                    buttonAction: params.buttonAction,
                    buttonActionTarget: params.buttonActionTarget,
                },
            ];
        }
        else {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "Provide either 'visualType' (single) or 'visuals' array (batch)",
                        }),
                    },
                ],
            };
        }
        // Binding validation (strict / warn / off).
        // Flatten bindings across every spec in the call so one validator pass
        // covers the whole batch. Fields with no bindings (shapes, text,
        // buttons, images) contribute nothing and are skipped.
        const allBindings = [];
        for (const spec of specs) {
            if (spec.bindings) {
                for (const b of spec.bindings) {
                    allBindings.push({
                        bucket: b.bucket,
                        fields: b.fields,
                    });
                }
            }
        }
        const validation = (0, bindingValidation_js_1.runBindingValidation)(ctx.project, allBindings, params.strictBindings);
        if (!validation.proceed) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: validation.message,
                            bindingErrors: validation.errors,
                            mode: validation.mode,
                        }, null, 2),
                    },
                ],
            };
        }
        const results = [];
        for (let i = 0; i < specs.length; i++) {
            const result = (0, createVisual_js_1.createAndSaveVisual)(ctx.project, pageId, specs[i], maxZ + (i + 1) * 1000);
            results.push(result);
        }
        (0, model_usage_js_1.invalidateCache)();
        const response = {
            success: true,
            pageId,
            created: results,
        };
        if (validation.errors.length > 0) {
            response.bindingWarnings = validation.errors;
            response.bindingWarningMessage = validation.message;
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response, null, 2),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: delete_visual
    // ============================================================
    server.tool("delete_visual", "Delete a visual from a page", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID to delete"),
    }, async ({ pageId, visualId }) => {
        ctx.project.deleteVisual(pageId, visualId);
        (0, model_usage_js_1.invalidateCache)();
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, deletedVisualId: visualId }) }],
        };
    });
    // ============================================================
    // TOOL: move_visual
    // ============================================================
    server.tool("move_visual", "Move and/or resize a visual on a page", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        x: zod_1.z.number().optional().describe("New X position"),
        y: zod_1.z.number().optional().describe("New Y position"),
        width: zod_1.z.number().optional().describe("New width"),
        height: zod_1.z.number().optional().describe("New height"),
        z: zod_1.z.number().optional().describe("New z-order (layer)"),
    }, async ({ pageId, visualId, x, y, width, height, z }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        if (x !== undefined)
            visual.position.x = x;
        if (y !== undefined)
            visual.position.y = y;
        if (width !== undefined)
            visual.position.width = width;
        if (height !== undefined)
            visual.position.height = height;
        if (z !== undefined) {
            visual.position.z = z;
            visual.position.tabOrder = z;
        }
        ctx.project.saveVisual(pageId, visualId, visual);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, position: visual.position }) }],
        };
    });
    // ============================================================
    // TOOL: duplicate_visual
    // ============================================================
    server.tool("duplicate_visual", "Duplicate an existing visual, optionally to a different page or position", {
        pageId: zod_1.z.string().describe("Source page ID"),
        visualId: zod_1.z.string().describe("Visual ID to duplicate"),
        targetPageId: zod_1.z.string().optional().describe("Target page ID (defaults to same page)"),
        offsetX: zod_1.z.number().optional().default(20).describe("X offset for the duplicate"),
        offsetY: zod_1.z.number().optional().default(20).describe("Y offset for the duplicate"),
    }, async ({ pageId, visualId, targetPageId, offsetX, offsetY }) => {
        const original = ctx.project.getVisual(pageId, visualId);
        const newId = (0, pbir_js_1.generateId)();
        const target = targetPageId || pageId;
        const duplicate = JSON.parse(JSON.stringify(original));
        duplicate.name = newId;
        duplicate.position.x += offsetX;
        duplicate.position.y += offsetY;
        duplicate.position.z += 1000;
        duplicate.position.tabOrder += 1000;
        if (duplicate.filterConfig?.filters) {
            for (const f of duplicate.filterConfig.filters) {
                f.name = (0, pbir_js_1.generateId)();
            }
        }
        ctx.project.saveVisual(target, newId, duplicate);
        (0, model_usage_js_1.invalidateCache)();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, newVisualId: newId, targetPageId: target }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: change_visual_type
    // ============================================================
    server.tool("change_visual_type", "Change the visual type of an existing visual (e.g. barChart to columnChart) while keeping data bindings", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        visualType: zod_1.z.string().describe("The new visual type"),
    }, async ({ pageId, visualId, visualType }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        visual.visual.visualType = visualType;
        ctx.project.saveVisual(pageId, visualId, visual);
        (0, model_usage_js_1.invalidateCache)();
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, visualId, visualType }) }],
        };
    });
}
