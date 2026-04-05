"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBindingTools = registerBindingTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("../helpers/createVisual.js");
function registerBindingTools(server, ctx) {
    // ============================================================
    // TOOL: update_visual_bindings
    // ============================================================
    server.tool("update_visual_bindings", `Update the data bindings of an existing visual. Replaces the query state entirely. Supports Table[Column] shorthand: use { "field": "Sales[Net Price]", "type": "measure" } as an alternative to separate entity/property fields.`, {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        bindings: zod_1.z.array(createVisual_js_1.BucketBindingSchema).describe("New data bindings"),
        autoFilters: zod_1.z.boolean().optional().default(true),
    }, async ({ pageId, visualId, bindings, autoFilters }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        const vType = visual.visual.visualType;
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
                    (bucketName === "Category" || (createVisual_js_1.SLICER_VISUAL_TYPES.has(vType) && bucketName === "Values"));
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
        // Rebuild sort from Category
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
        else {
            if (visual.visual.query.sortDefinition) {
                delete visual.visual.query.sortDefinition;
            }
        }
        if (autoFilters) {
            visual.filterConfig = { filters: (0, pbir_js_1.buildAutoFilters)(queryState) };
        }
        ctx.project.saveVisual(pageId, visualId, visual);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, visualId }) }],
        };
    });
}
