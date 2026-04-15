"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBulkTools = registerBulkTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
const formatting_js_1 = require("../helpers/formatting.js");
const model_usage_js_1 = require("../model-usage.js");
// Helper: accept both a real array and a JSON-stringified array (MCP serialisation quirk).
// The explicit `z.ZodType<T[]>` return cast is required because `z.preprocess` widens
// the output to `unknown` under strict mode — which breaks downstream `z.infer` chains
// (e.g. `bindings: parseArray(...)` would destructure as `unknown` instead of `T[]`).
function parseArray(schema) {
    return zod_1.z.preprocess((val) => (typeof val === "string" ? JSON.parse(val) : val), zod_1.z.array(schema));
}
function registerBulkTools(server, ctx) {
    // ============================================================
    // TOOL: bulk_delete_visuals
    // ============================================================
    server.tool("bulk_delete_visuals", "Delete multiple visuals from a page in one call.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualIds: parseArray(zod_1.z.string()).describe("Visual IDs to delete"),
    }, async ({ pageId, visualIds }) => {
        const deleted = [];
        const errors = [];
        for (const vid of visualIds) {
            try {
                ctx.project.deleteVisual(pageId, vid);
                deleted.push(vid);
            }
            catch (err) {
                errors.push(`${vid}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        (0, model_usage_js_1.invalidateCache)();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, deleted: deleted.length, ids: deleted, errors }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: bulk_update_format
    // ============================================================
    server.tool("bulk_update_format", "Apply the same formatting to multiple visuals in one call. target='container' for title/background/border, 'visual' for axes/legend/labels.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualIds: parseArray(zod_1.z.string()).describe("Visual IDs to format"),
        formatting: parseArray(createVisual_js_1.FormatCategorySchema).describe("Formatting to apply to all visuals"),
        target: zod_1.z
            .enum(["visual", "container"])
            .optional()
            .default("visual")
            .describe("'container' = title/background/border, 'visual' = axes/labels/legend"),
    }, async ({ pageId, visualIds, formatting, target }) => {
        const updated = [];
        const errors = [];
        for (const vid of visualIds) {
            try {
                const visual = ctx.project.getVisual(pageId, vid);
                const targetObj = target === "container"
                    ? (visual.visual.visualContainerObjects ??= {})
                    : (visual.visual.objects ??= {});
                (0, formatting_js_1.applyFormattingToTarget)(targetObj, formatting);
                ctx.project.saveVisual(pageId, vid, visual);
                updated.push(vid);
            }
            catch (err) {
                errors.push(`${vid}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, updated: updated.length, ids: updated, errors }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: bulk_bind
    // ============================================================
    server.tool("bulk_bind", "Update data bindings on multiple visuals in one call. Each entry specifies a visualId and its new bindings. Replaces existing bindings entirely.", {
        pageId: zod_1.z.string().describe("The page ID"),
        updates: parseArray(zod_1.z.object({
            visualId: zod_1.z.string().describe("Visual ID to rebind"),
            bindings: parseArray(createVisual_js_1.BucketBindingSchema).describe("New bindings"),
        })).describe("Array of {visualId, bindings} pairs"),
        autoFilters: zod_1.z
            .boolean()
            .optional()
            .default(true)
            .describe("Rebuild auto-filters for each visual"),
    }, async ({ pageId, updates, autoFilters }) => {
        const updated = [];
        const errors = [];
        for (const { visualId, bindings } of updates) {
            try {
                const visual = ctx.project.getVisual(pageId, visualId);
                const vType = visual.visual.visualType;
                // Build query state
                const queryState = {};
                for (const binding of bindings) {
                    let bucketName = binding.bucket;
                    if (bucketName === "Fields") {
                        const validBuckets = pbir_js_1.VISUAL_BUCKETS[vType];
                        if (validBuckets && validBuckets.length > 0 && !validBuckets.includes("Fields")) {
                            bucketName = validBuckets[0];
                        }
                    }
                    const projections = binding.fields.map((fieldSpec, i) => {
                        const field = (0, createVisual_js_1.parseFieldSpec)(fieldSpec);
                        const isFirst = i === 0 &&
                            (bucketName === "Category" ||
                                (createVisual_js_1.SLICER_VISUAL_TYPES.has(vType) && bucketName === "Values"));
                        return {
                            field,
                            queryRef: (0, pbir_js_1.buildQueryRef)(field),
                            nativeQueryRef: (0, pbir_js_1.buildNativeQueryRef)(field),
                            ...(isFirst ? { active: true } : {}),
                        };
                    });
                    queryState[bucketName] = { projections };
                }
                if (!visual.visual.query) {
                    visual.visual.query = { queryState };
                }
                else {
                    visual.visual.query.queryState = queryState;
                }
                // Rebuild sort
                if (queryState.Category?.projections?.[0]) {
                    visual.visual.query.sortDefinition = {
                        sort: [
                            {
                                field: JSON.parse(JSON.stringify(queryState.Category.projections[0].field)),
                                direction: "Ascending",
                            },
                        ],
                        isDefaultSort: true,
                    };
                }
                else if (createVisual_js_1.SLICER_VISUAL_TYPES.has(vType) && queryState.Values?.projections?.[0]) {
                    visual.visual.query.sortDefinition = {
                        sort: [
                            {
                                field: JSON.parse(JSON.stringify(queryState.Values.projections[0].field)),
                                direction: "Ascending",
                            },
                        ],
                    };
                }
                else if (visual.visual.query.sortDefinition) {
                    delete visual.visual.query.sortDefinition;
                }
                if (autoFilters) {
                    visual.filterConfig = { filters: (0, pbir_js_1.buildAutoFilters)(queryState) };
                }
                ctx.project.saveVisual(pageId, visualId, visual);
                updated.push(visualId);
            }
            catch (err) {
                errors.push(`${visualId}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        (0, model_usage_js_1.invalidateCache)();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, updated: updated.length, ids: updated, errors }),
                },
            ],
        };
    });
}
