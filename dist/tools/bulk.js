"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBulkTools = registerBulkTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
const formatting_js_1 = require("../helpers/formatting.js");
const model_usage_js_1 = require("../model-usage.js");
const bindingValidation_js_1 = require("../helpers/bindingValidation.js");
// Helper: accept both a real array and a JSON-stringified array (MCP serialisation quirk).
// The explicit `z.ZodType<T[]>` return cast is required because `z.preprocess` widens
// the output to `unknown` under strict mode — which breaks downstream `z.infer` chains
// (e.g. `bindings: parseArray(...)` would destructure as `unknown` instead of `T[]`).
function parseArray(schema) {
    return zod_1.z.preprocess((val) => (typeof val === "string" ? JSON.parse(val) : val), zod_1.z.array(schema));
}
// ---------------------------------------------------------------------------
// Safety gate for bulk operations.
//
// Why: an agent that calls `list_visuals` and then pipes every id straight
// into `bulk_delete_visuals` can wipe an entire page in one call with no
// second thought. The gate forces the agent to explicitly acknowledge the
// size of the operation when it crosses a threshold — matching the pattern
// in MinaSaad1/pbi-cli where every bulk command requires an explicit filter
// flag to prevent accidental mass operations.
//
// Rule: if the operation would touch more than BULK_CONFIRM_THRESHOLD items
// and `confirmBulk !== true`, return a structured error instead of running.
// The error names the count and tells the agent exactly how to proceed.
// ---------------------------------------------------------------------------
const BULK_CONFIRM_THRESHOLD = 5;
function bulkSafetyError(verb, count) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: `Safety gate: this call would ${verb} ${count} visuals (threshold ${BULK_CONFIRM_THRESHOLD}). ` +
                        `Set confirmBulk: true to proceed, or reduce the list to ≤${BULK_CONFIRM_THRESHOLD} items.`,
                    count,
                    threshold: BULK_CONFIRM_THRESHOLD,
                    confirmBulkRequired: true,
                }),
            },
        ],
    };
}
function registerBulkTools(server, ctx) {
    // ============================================================
    // TOOL: bulk_delete_visuals
    // ============================================================
    server.tool("bulk_delete_visuals", "Delete multiple visuals from a page in one call. Set confirmBulk:true when deleting >5.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualIds: parseArray(zod_1.z.string()).describe("Visual IDs to delete"),
        confirmBulk: zod_1.z.coerce.boolean().optional().default(false)
            .describe(`Required acknowledgment when the operation would affect more than ${BULK_CONFIRM_THRESHOLD} visuals. Guards against accidental page wipes.`),
    }, async ({ pageId, visualIds, confirmBulk }) => {
        if (visualIds.length > BULK_CONFIRM_THRESHOLD && !confirmBulk) {
            return bulkSafetyError("delete", visualIds.length);
        }
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
    server.tool("bulk_update_format", "Apply the same formatting to multiple visuals in one call. target='container' for title/background/border, 'visual' for axes/legend/labels. Set confirmBulk:true when formatting >5.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualIds: parseArray(zod_1.z.string()).describe("Visual IDs to format"),
        formatting: parseArray(createVisual_js_1.FormatCategorySchema).describe("Formatting to apply to all visuals"),
        target: zod_1.z
            .enum(["visual", "container"])
            .optional()
            .default("visual")
            .describe("'container' = title/background/border, 'visual' = axes/labels/legend"),
        confirmBulk: zod_1.z.coerce.boolean().optional().default(false)
            .describe(`Required acknowledgment when the operation would affect more than ${BULK_CONFIRM_THRESHOLD} visuals.`),
    }, async ({ pageId, visualIds, formatting, target, confirmBulk }) => {
        if (visualIds.length > BULK_CONFIRM_THRESHOLD && !confirmBulk) {
            return bulkSafetyError("format", visualIds.length);
        }
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
    server.tool("bulk_bind", "Update data bindings on multiple visuals in one call. Each entry specifies a visualId and its new bindings. Replaces existing bindings entirely. Set confirmBulk:true when rebinding >5.", {
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
        confirmBulk: zod_1.z.coerce.boolean().optional().default(false)
            .describe(`Required acknowledgment when the operation would affect more than ${BULK_CONFIRM_THRESHOLD} visuals.`),
        strictBindings: zod_1.z
            .boolean()
            .optional()
            .describe("Binding validation: true=strict (default, fail on unknown field), false=warn (proceed with warnings). Omit for env default."),
    }, async ({ pageId, updates, autoFilters, confirmBulk, strictBindings }) => {
        if (updates.length > BULK_CONFIRM_THRESHOLD && !confirmBulk) {
            return bulkSafetyError("rebind", updates.length);
        }
        // Binding validation — flatten every update's bindings into one pass.
        // A single unknown field in the batch fails the whole call in strict
        // mode; individual visual lookups still run per-entry below.
        const allBindings = [];
        for (const { bindings } of updates) {
            for (const b of bindings) {
                allBindings.push({ bucket: b.bucket, fields: b.fields });
            }
        }
        const validation = (0, bindingValidation_js_1.runBindingValidation)(ctx.project, allBindings, strictBindings);
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
        const bulkResponse = {
            success: true,
            updated: updated.length,
            ids: updated,
            errors,
        };
        if (validation.errors.length > 0) {
            bulkResponse.bindingWarnings = validation.errors;
            bulkResponse.bindingWarningMessage = validation.message;
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(bulkResponse),
                },
            ],
        };
    });
}
