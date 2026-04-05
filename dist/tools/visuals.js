"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVisualTools = registerVisualTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
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
    server.tool("list_visuals", "List all visuals on a page", {
        pageId: zod_1.z.string().describe("The page ID"),
    }, async ({ pageId }) => {
        const visualIds = ctx.project.listVisualIds(pageId);
        const visuals = visualIds.map((id) => {
            const v = ctx.project.getVisual(pageId, id);
            return {
                id,
                visualType: v.visual.visualType,
                position: v.position,
                filterCount: v.filterConfig?.filters?.length ?? 0,
            };
        });
        return { content: [{ type: "text", text: JSON.stringify(visuals, null, 2) }] };
    });
    // ============================================================
    // TOOL: get_visual
    // ============================================================
    server.tool("get_visual", "Get the full definition of a visual", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
    }, async ({ pageId, visualId }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        return { content: [{ type: "text", text: JSON.stringify(visual, null, 2) }] };
    });
    // ============================================================
    // TOOL: add_visual (single + batch mode)
    // ============================================================
    server.tool("add_visual", `Add one or more visuals to a page with optional inline formatting. Supports single mode (use top-level params) or batch mode (use 'visuals' array). Inline containerFormat, visualFormat, and dataColors eliminate the need for separate format_visual/set_datapoint_colors calls. IMPORTANT chart naming (Power BI convention): 'columnChart'=stacked column (use Series bucket for stack breakdown), 'barChart'=stacked bar (use Series bucket for stack breakdown), 'clusteredColumnChart'=clustered column, 'clusteredBarChart'=clustered bar, 'hundredPercentStackedColumnChart'=100% stacked column, 'hundredPercentStackedBarChart'=100% stacked bar. Visual types: ${Object.keys(pbir_js_1.VISUAL_BUCKETS).join(", ")}.`, {
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
        containerFormat: zod_1.z.array(createVisual_js_1.FormatCategorySchema).optional().describe("Inline container formatting"),
        visualFormat: zod_1.z.array(createVisual_js_1.FormatCategorySchema).optional().describe("Inline visual formatting"),
        dataColors: zod_1.z.array(createVisual_js_1.DataColorSchema).optional().describe("Inline data point colors"),
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
        const results = [];
        for (let i = 0; i < specs.length; i++) {
            const result = (0, createVisual_js_1.createAndSaveVisual)(ctx.project, pageId, specs[i], maxZ + (i + 1) * 1000);
            results.push(result);
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, pageId, created: results }, null, 2),
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
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, visualId, visualType }) }],
        };
    });
}
