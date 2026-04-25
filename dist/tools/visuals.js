"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVisualTools = registerVisualTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
const model_usage_js_1 = require("../model-usage.js");
const bindingValidation_js_1 = require("../helpers/bindingValidation.js");
const extractTitle_js_1 = require("../helpers/extractTitle.js");
const layoutValidation_js_1 = require("../helpers/layoutValidation.js");
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
    }, async ({ pageId, visualId, slim }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        if (!slim) {
            return { content: [{ type: "text", text: JSON.stringify(visual, null, 2) }] };
        }
        // Extract title
        const titleValue = (0, extractTitle_js_1.extractVisualTitle)(visual.visual.visualContainerObjects);
        // Extract bindings as Table[Field] strings
        const bindings = {};
        const qs = visual.visual.query?.queryState;
        if (qs) {
            for (const [bucket, state] of Object.entries(qs)) {
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
            const objs = visual.visual.objects;
            const dataArr = objs?.data;
            const selectionArr = objs?.selection;
            let slicerMode;
            if (vType === "slicer") {
                const modeLit = dataArr?.[0]?.properties?.mode?.expr?.Literal?.Value;
                if (typeof modeLit === "string") {
                    slicerMode = modeLit.replace(/^'|'$/g, "");
                }
                else {
                    slicerMode = "Dropdown"; // PBI default
                }
                result.slicerMode = slicerMode;
            }
            const singleLit = selectionArr?.[0]?.properties?.singleSelect?.expr?.Literal?.Value;
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
    server.tool("add_visual", "Add one or more visuals to a page. Pass `visuals` array. Inline containerFormat/visualFormat/dataColors per entry avoids extra format_visual calls. Call `lookup_theme_property` for valid category/property names per visualType. Stacked charts (columnChart/barChart) need a Series binding. 'KPI card' = `card` with one measure. Scatter uses `Details` bucket.", {
        pageId: zod_1.z.string(),
        visuals: zod_1.z.array(createVisual_js_1.VisualSpecSchema),
        strictBindings: zod_1.z
            .boolean()
            .optional()
            .describe("Binding validation: true=strict, false=warn. Omit for env default."),
        strictLayout: zod_1.z
            .boolean()
            .optional()
            .describe("Layout validation: true=strict, false=warn. Omit for env default. Canvas 1280x720, 15px L/R and 6px bottom margins, 5px gaps."),
    }, async (params) => {
        const { pageId } = params;
        const existingVisuals = ctx.project.listVisualIds(pageId);
        let maxZ = 0;
        for (const vid of existingVisuals) {
            const v = ctx.project.getVisual(pageId, vid);
            if (v.position.z > maxZ)
                maxZ = v.position.z;
        }
        const specs = params.visuals;
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
        // Layout validation — run against EVERY visual that will be on the
        // page after this call completes. Existing visuals + the new specs.
        // Validator needs the full picture to spot overlaps/alignment.
        const existingWireframe = existingVisuals.map((vid) => {
            const v = ctx.project.getVisual(pageId, vid);
            return {
                id: vid,
                visualType: v.visual.visualType,
                x: v.position.x,
                y: v.position.y,
                width: v.position.width,
                height: v.position.height,
                title: (0, extractTitle_js_1.extractVisualTitle)(v.visual.visualContainerObjects) || undefined,
            };
        });
        const newWireframe = specs.map((s, i) => ({
            id: `__pending_${i}`,
            visualType: s.visualType,
            x: s.x ?? 0,
            y: s.y ?? 0,
            width: s.width ?? 280,
            height: s.height ?? 280,
            title: s.title,
        }));
        const layoutValidation = (0, layoutValidation_js_1.runLayoutValidation)([...existingWireframe, ...newWireframe], params.strictLayout);
        if (!layoutValidation.proceed) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "layout_validation_failed",
                            hint: "Set strictLayout:false to proceed with warnings, or fix the positions per `suggestion`. Canvas constants echoed for grounding.",
                            mode: layoutValidation.mode,
                            canvas: layoutValidation.canvas,
                            layoutErrors: layoutValidation.errors,
                            layoutWarnings: layoutValidation.warnings,
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
            canvas: (0, layoutValidation_js_1.getCanvasSummary)(),
        };
        (0, bindingValidation_js_1.attachBindingValidationMetadata)(response, validation);
        if (layoutValidation.warnings.length > 0) {
            response.layoutWarnings = layoutValidation.warnings;
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
