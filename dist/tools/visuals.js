"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVisualTools = registerVisualTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
const context_js_1 = require("../context.js");
const model_usage_js_1 = require("../model-usage.js");
const bindingValidation_js_1 = require("../helpers/bindingValidation.js");
const extractTitle_js_1 = require("../helpers/extractTitle.js");
const layoutValidation_js_1 = require("../helpers/layoutValidation.js");
const themeIndex_js_1 = require("../helpers/themeIndex.js");
const resolvePage_js_1 = require("../helpers/resolvePage.js");
const readCache_js_1 = require("../helpers/readCache.js");
function registerVisualTools(server, ctx) {
    // ============================================================
    // TOOL: pbir_get_visual_types
    // ============================================================
    server.tool("pbir_get_visual_types", "Get a list of available visual types and their data role buckets", {}, { "readOnlyHint": true, "openWorldHint": false }, async () => {
        return { content: [{ type: "text", text: JSON.stringify(pbir_js_1.VISUAL_BUCKETS, null, 2) }] };
    });
    // ============================================================
    // TOOL: pbir_list_visuals
    // ============================================================
    server.tool("pbir_list_visuals", "List all visuals on a page. Default slim returns id/type/x/y/w/h/title. slim:false includes filterCount.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        slim: zod_1.z.boolean().optional().default(true),
    }, { "readOnlyHint": true, "openWorldHint": false }, async ({ pageId, slim }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const finalPageId = pageId;
        return (0, readCache_js_1.cachedRead)("pbir_list_visuals", { pageId: finalPageId, slim }, [`page:${finalPageId}`], () => {
            const visualIds = ctx.project.listVisualIds(finalPageId);
            const visuals = visualIds.map((id) => {
                const v = ctx.project.getVisual(finalPageId, id);
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
            return visuals;
        });
    });
    // ============================================================
    // TOOL: pbir_get_visual
    // ============================================================
    server.tool("pbir_get_visual", "Get visual details. Default returns id/type/position/title/bindings summary. verbose:true returns full PBIR JSON.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID"),
        verbose: zod_1.z.boolean().optional().describe("Full raw PBIR JSON (heavy)."),
        slim: zod_1.z.boolean().optional().describe("Deprecated alias for !verbose."),
    }, { "readOnlyHint": true, "openWorldHint": false }, async ({ pageId, visualId, verbose, slim }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const finalPageId = pageId;
        // Default = slim. verbose:true OR legacy slim:false → full JSON.
        const wantFull = verbose === true || slim === false;
        return (0, readCache_js_1.cachedRead)("pbir_get_visual", { pageId: finalPageId, visualId, verbose: wantFull }, [`page:${finalPageId}`], () => {
            const visual = ctx.project.getVisual(finalPageId, visualId);
            if (wantFull) {
                return visual;
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
            return result;
        });
    });
    // ============================================================
    // TOOL: pbir_add_visual (single + batch mode)
    // ============================================================
    server.tool("pbir_add_visual", "Add one or more visuals to a page. Pass `visuals` array. Inline containerFormat/visualFormat/dataColors per entry avoids extra pbir_format_visual calls. Call `pbir_lookup_theme_property` for valid category/property names per visualType. Stacked charts (columnChart/barChart) need a Series binding. 'KPI card' = `card` with one measure. Scatter uses `Details` bucket.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visuals: zod_1.z.array(createVisual_js_1.VisualSpecSchema),
        strictBindings: zod_1.z
            .boolean()
            .optional()
            .describe("Binding validation: true=strict, false=warn. Omit for env default."),
        strictLayout: zod_1.z
            .boolean()
            .optional()
            .describe("Layout validation: true=strict, false=warn. Omit for env default. Canvas 1280x720, 15px L/R and 6px bottom margins, 5px gaps."),
        includeTypes: zod_1.z
            .boolean()
            .optional()
            .describe("Return [{visualId,visualType}] instead of flat id list."),
    }, { "openWorldHint": false }, async (params) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, params.pageId);
        if (!r.resolved)
            return r.errorResponse;
        const pageId = r.pageId;
        const existingVisuals = ctx.project.listVisualIds(pageId);
        let maxZ = 0;
        for (const vid of existingVisuals) {
            const v = ctx.project.getVisual(pageId, vid);
            if (v.position.z > maxZ)
                maxZ = v.position.z;
        }
        const specs = params.visuals;
        // Cheap typo catcher — flag misspelled category/property names against
        // the bundled schema BEFORE we burn binding/layout cycles. Always-on,
        // no opt-out. Unknown visualType → no-op (schema lag tolerance).
        const typoIssues = [];
        for (let i = 0; i < specs.length; i++) {
            const s = specs[i];
            const entries = [
                ...(s.containerFormat ?? []),
                ...(s.visualFormat ?? []),
            ];
            if (entries.length === 0)
                continue;
            const issues = (0, themeIndex_js_1.validateFormatTypos)(s.visualType, entries);
            for (const issue of issues)
                typoIssues.push({ visualIndex: i, ...issue });
        }
        if (typoIssues.length > 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "format_typo",
                            issues: typoIssues.map(({ visualIndex, category, prop, didYouMean }) => ({
                                visualIndex,
                                cat: category,
                                ...(prop ? { prop } : {}),
                                didYouMean,
                            })),
                        }, null, 2),
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
                            error: "binding_validation_failed",
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        // Slim by default: ship a flat string[] of ids. The 150-token canvas
        // object only ships when the LLM asks for it on pbir_create_page or when
        // layout validation fails — sending it on every successful add is
        // pure carry-forward bloat.
        const response = {
            success: true,
            pageId,
            created: params.includeTypes
                ? results
                : results.map((r) => r.visualId),
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
    // TOOL: pbir_delete_visual
    // ============================================================
    server.tool("pbir_delete_visual", "Delete a visual from a page", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID to delete"),
    }, { "destructiveHint": true, "openWorldHint": false }, async ({ pageId, visualId }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        ctx.project.deleteVisual(pageId, visualId);
        (0, model_usage_js_1.invalidateCache)();
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, deletedVisualId: visualId }) }],
        };
    });
    // ============================================================
    // TOOL: pbir_move_visual
    // ============================================================
    server.tool("pbir_move_visual", "Move and/or resize a visual on a page", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualId: zod_1.z.string().describe("The visual ID"),
        x: zod_1.z.number().optional(),
        y: zod_1.z.number().optional(),
        width: zod_1.z.number().optional(),
        height: zod_1.z.number().optional(),
        z: zod_1.z.number().optional().describe("z-order"),
    }, { "openWorldHint": false }, async ({ pageId, visualId, x, y, width, height, z }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, position: visual.position }) }],
        };
    });
    // ============================================================
    // TOOL: pbir_duplicate_visual
    // ============================================================
    server.tool("pbir_duplicate_visual", "Duplicate an existing visual, optionally to a different page or position", {
        pageId: zod_1.z.string().describe("Source page ID"),
        visualId: zod_1.z.string().describe("Visual ID to duplicate"),
        targetPageId: zod_1.z.string().optional().describe("Target page ID (defaults to same page)"),
        offsetX: zod_1.z.number().optional().default(20).describe("X offset for the duplicate"),
        offsetY: zod_1.z.number().optional().default(20).describe("Y offset for the duplicate"),
    }, { "openWorldHint": false }, async ({ pageId, visualId, targetPageId, offsetX, offsetY }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
        (0, readCache_js_1.invalidateScope)(`page:${target}`);
        if (target !== pageId)
            (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    // TOOL: pbir_change_visual_type
    // ============================================================
    server.tool("pbir_change_visual_type", "Change the visual type of an existing visual (e.g. barChart to columnChart) while keeping data bindings", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        visualType: zod_1.z.string().describe("The new visual type"),
    }, { "openWorldHint": false }, async ({ pageId, visualId, visualType }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const visual = ctx.project.getVisual(pageId, visualId);
        visual.visual.visualType = visualType;
        ctx.project.saveVisual(pageId, visualId, visual);
        (0, model_usage_js_1.invalidateCache)();
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, visualId, visualType }) }],
        };
    });
}
