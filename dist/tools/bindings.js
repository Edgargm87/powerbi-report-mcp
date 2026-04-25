"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBindingTools = registerBindingTools;
const zod_1 = require("zod");
const createVisual_js_1 = require("../helpers/createVisual.js");
const model_usage_js_1 = require("../model-usage.js");
const bindingValidation_js_1 = require("../helpers/bindingValidation.js");
const bindingApply_js_1 = require("../helpers/bindingApply.js");
const readCache_js_1 = require("../helpers/readCache.js");
function registerBindingTools(server, ctx) {
    // ============================================================
    // TOOL: update_visual_bindings
    // ============================================================
    server.tool("update_visual_bindings", `Update the data bindings of an existing visual. Replaces the query state entirely. Supports Table[Column] shorthand: use { "field": "Sales[Net Price]", "type": "measure" } as an alternative to separate entity/property fields.`, {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        bindings: zod_1.z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, zod_1.z.array(createVisual_js_1.BucketBindingSchema)).describe("New data bindings"),
        autoFilters: zod_1.z.boolean().optional().default(true),
        strictBindings: zod_1.z
            .boolean()
            .optional()
            .describe("Binding validation: true=strict (default, fail on unknown field), false=warn (proceed with warnings). Omit for env default."),
    }, async ({ pageId, visualId, bindings, autoFilters, strictBindings }) => {
        // Binding validation — before any write.
        const validationBindings = bindings.map((b) => ({
            bucket: b.bucket,
            fields: b.fields,
        }));
        const validation = (0, bindingValidation_js_1.runBindingValidation)(ctx.project, validationBindings, strictBindings);
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
        const visual = ctx.project.getVisual(pageId, visualId);
        (0, bindingApply_js_1.applyBindingsToVisual)(visual, bindings.map((b) => ({ bucket: b.bucket, fields: b.fields })), { autoFilters: autoFilters ?? true });
        ctx.project.saveVisual(pageId, visualId, visual);
        (0, model_usage_js_1.invalidateCache)();
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        const response = { success: true, visualId };
        (0, bindingValidation_js_1.attachBindingValidationMetadata)(response, validation);
        return {
            content: [{ type: "text", text: JSON.stringify(response) }],
        };
    });
}
