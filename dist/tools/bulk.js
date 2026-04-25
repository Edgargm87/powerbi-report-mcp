"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBulkTools = registerBulkTools;
const zod_1 = require("zod");
const createVisual_js_1 = require("../helpers/createVisual.js");
const formatting_js_1 = require("../helpers/formatting.js");
const model_usage_js_1 = require("../model-usage.js");
const bindingValidation_js_1 = require("../helpers/bindingValidation.js");
const bindingApply_js_1 = require("../helpers/bindingApply.js");
const mcpResult_js_1 = require("../helpers/mcpResult.js");
const resolvePage_js_1 = require("../helpers/resolvePage.js");
const readCache_js_1 = require("../helpers/readCache.js");
// Helper: accept both a real array and a JSON-stringified array (MCP serialisation quirk).
// The explicit `z.ZodType<T[]>` return cast is required because `z.preprocess` widens
// the output to `unknown` under strict mode — which breaks downstream `z.infer` chains
// (e.g. `bindings: parseArray(...)` would destructure as `unknown` instead of `T[]`).
function parseArray(schema) {
    return zod_1.z.preprocess((val) => (typeof val === "string" ? JSON.parse(val) : val), zod_1.z.array(schema));
}
// ---------------------------------------------------------------------------
// Safety gates for bulk operations — two layers, different jobs.
//
// 1. BULK_CONFIRM_THRESHOLD (soft gate, UX-focused)
//    An agent that calls `list_visuals` and then pipes every id straight
//    into `bulk_delete_visuals` can wipe an entire page in one call with no
//    second thought. The gate forces the agent to explicitly acknowledge the
//    size of the operation when it crosses a threshold — matching the pattern
//    in MinaSaad1/pbi-cli where every bulk command requires an explicit
//    filter flag to prevent accidental mass operations. Bypassable via
//    confirmBulk:true.
//
// 2. BULK_MAX_ITEMS (hard cap, safety-focused)
//    A 1000-visual page is already pathological — a 10,000-id array is
//    almost certainly a malformed input (accidental unbounded JSON, copy
//    error, or outright abuse). We cap at 1000 regardless of confirmBulk so
//    a runaway call can't consume the whole server tick writing thousands
//    of files. Cannot be bypassed — agent must chunk.
// ---------------------------------------------------------------------------
const BULK_CONFIRM_THRESHOLD = 5;
const BULK_MAX_ITEMS = 1000;
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
        isError: true,
    };
}
/**
 * Hard ceiling for bulk operations. Returned before any mutation runs — the
 * agent must split the work into smaller batches. This is NOT bypassable
 * with confirmBulk (that's the soft gate's job).
 */
function bulkSizeLimitError(verb, count) {
    return (0, mcpResult_js_1.fail)(`Bulk size limit: this call would ${verb} ${count} visuals, exceeding the hard cap of ${BULK_MAX_ITEMS}. ` +
        `Split into batches of ≤${BULK_MAX_ITEMS}. A page with that many visuals is almost always a misconfiguration — ` +
        `consider using list_visuals + filter logic before calling a bulk tool.`, { count, limit: BULK_MAX_ITEMS, reason: "bulk_size_limit_exceeded" });
}
function registerBulkTools(server, ctx) {
    // ============================================================
    // TOOL: bulk_delete_visuals
    // ============================================================
    server.tool("bulk_delete_visuals", "Delete multiple visuals from a page. Set confirmBulk:true when >5.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualIds: parseArray(zod_1.z.string()),
        confirmBulk: zod_1.z.coerce.boolean().optional().default(false)
            .describe(`Required when >${BULK_CONFIRM_THRESHOLD}.`),
    }, { "destructiveHint": true, "openWorldHint": false }, async ({ pageId, visualIds, confirmBulk }) => {
        const rp = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!rp.resolved)
            return rp.errorResponse;
        pageId = rp.pageId;
        if (visualIds.length > BULK_MAX_ITEMS) {
            return bulkSizeLimitError("delete", visualIds.length);
        }
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("bulk_update_format", "Apply the same formatting to multiple visuals. target='container' (title/background/border) or 'visual' (axes/legend/labels). Set confirmBulk:true when >5.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        visualIds: parseArray(zod_1.z.string()),
        formatting: parseArray(createVisual_js_1.FormatCategorySchema),
        target: zod_1.z.enum(["visual", "container"]).optional().default("visual"),
        confirmBulk: zod_1.z.coerce.boolean().optional().default(false)
            .describe(`Required when >${BULK_CONFIRM_THRESHOLD}.`),
    }, { "openWorldHint": false }, async ({ pageId, visualIds, formatting, target, confirmBulk }) => {
        const rp = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!rp.resolved)
            return rp.errorResponse;
        pageId = rp.pageId;
        if (visualIds.length > BULK_MAX_ITEMS) {
            return bulkSizeLimitError("format", visualIds.length);
        }
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("bulk_bind", "Rebind multiple visuals in one call. Replaces existing bindings. Set confirmBulk:true when >5. continueOnError:true validates per-entry — bad bindings don't abort the batch.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        updates: parseArray(zod_1.z.object({
            visualId: zod_1.z.string(),
            bindings: parseArray(createVisual_js_1.BucketBindingSchema),
        })).describe("[{visualId, bindings}]"),
        autoFilters: zod_1.z.boolean().optional().default(true),
        confirmBulk: zod_1.z.coerce.boolean().optional().default(false)
            .describe(`Required when >${BULK_CONFIRM_THRESHOLD}.`),
        continueOnError: zod_1.z.coerce.boolean().optional().default(false)
            .describe("Per-entry validation; bad bindings don't abort the batch."),
        strictBindings: zod_1.z.boolean().optional().describe("true=strict (default), false=warn."),
    }, { "openWorldHint": false }, async ({ pageId, updates, autoFilters, confirmBulk, continueOnError, strictBindings }) => {
        const rp = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!rp.resolved)
            return rp.errorResponse;
        pageId = rp.pageId;
        if (updates.length > BULK_MAX_ITEMS) {
            return bulkSizeLimitError("rebind", updates.length);
        }
        if (updates.length > BULK_CONFIRM_THRESHOLD && !confirmBulk) {
            return bulkSafetyError("rebind", updates.length);
        }
        // Validation strategy:
        //   - default  : batch-level. A single unknown field in strict mode
        //                fails the whole call before any write.
        //   - continueOnError : per-entry. Each update is validated in isolation
        //                and bad entries are reported in `errors` while good
        //                entries still write.
        let validation;
        if (!continueOnError) {
            const allBindings = [];
            for (const { bindings } of updates) {
                for (const b of bindings) {
                    allBindings.push({ bucket: b.bucket, fields: b.fields });
                }
            }
            validation = (0, bindingValidation_js_1.runBindingValidation)(ctx.project, allBindings, strictBindings);
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
                                hint: "Retry with continueOnError:true to apply the valid entries and get a per-visual error report.",
                            }, null, 2),
                        },
                    ],
                };
            }
        }
        else {
            // Run a dry validation to capture mode/skipReason for the response,
            // but don't gate on it — per-entry validation drives write decisions.
            validation = (0, bindingValidation_js_1.runBindingValidation)(ctx.project, [], strictBindings);
        }
        const updated = [];
        const errors = [];
        const perEntryBindingErrors = [];
        for (const { visualId, bindings } of updates) {
            try {
                // Per-entry validation when continueOnError is set.
                if (continueOnError) {
                    const entryBindings = bindings.map((b) => ({
                        bucket: b.bucket,
                        fields: b.fields,
                    }));
                    const entryValidation = (0, bindingValidation_js_1.runBindingValidation)(ctx.project, entryBindings, strictBindings);
                    if (!entryValidation.proceed) {
                        errors.push(`${visualId}: binding_validation_failed`);
                        perEntryBindingErrors.push({ visualId, errors: entryValidation.errors });
                        continue;
                    }
                }
                const visual = ctx.project.getVisual(pageId, visualId);
                (0, bindingApply_js_1.applyBindingsToVisual)(visual, bindings.map((b) => ({ bucket: b.bucket, fields: b.fields })), { autoFilters: autoFilters ?? true });
                ctx.project.saveVisual(pageId, visualId, visual);
                updated.push(visualId);
            }
            catch (err) {
                errors.push(`${visualId}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        (0, model_usage_js_1.invalidateCache)();
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        const bulkResponse = {
            success: true,
            updated: updated.length,
            ids: updated,
            errors,
            ...(perEntryBindingErrors.length > 0 ? { perEntryBindingErrors } : {}),
        };
        (0, bindingValidation_js_1.attachBindingValidationMetadata)(bulkResponse, validation);
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
