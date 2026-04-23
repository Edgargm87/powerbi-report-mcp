"use strict";
// Shared visual-binding application logic.
//
// Both `update_visual_bindings` (single-visual) and `bulk_bind` (batch) used to
// inline the same ~60-line block: build queryState, handle the "Fields" bucket
// rewrite for visual types that don't support it, mark the first projection in
// Category (or slicer Values/Rows) as active, rebuild sortDefinition from the
// first Category projection (with isDefaultSort) or slicer projection, and
// optionally rebuild auto-filters. Drift risk was real: any fix to the slicer
// sort branch only ever got applied in one place.
//
// This helper centralises that behaviour. Both call sites now mutate the
// visual via this function and then saveVisual themselves.
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyBindingsToVisual = applyBindingsToVisual;
const pbir_js_1 = require("../pbir.js");
const createVisual_js_1 = require("./createVisual.js");
/**
 * Mutates `visual` in place with the new bindings and returns it for chaining.
 * Does NOT persist — caller is responsible for saveVisual.
 */
function applyBindingsToVisual(visual, bindings, opts) {
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
                (bucketName === "Category" ||
                    (createVisual_js_1.SLICER_VISUAL_TYPES.has(vType) && (bucketName === "Values" || bucketName === "Rows")));
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
    // Rebuild sort from Category (isDefaultSort) or from slicer Values/Rows.
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
    else if (createVisual_js_1.SLICER_VISUAL_TYPES.has(vType) &&
        (queryState.Values?.projections?.[0] || queryState.Rows?.projections?.[0])) {
        const slicerBucket = queryState.Values ?? queryState.Rows;
        visual.visual.query.sortDefinition = {
            sort: [
                {
                    field: JSON.parse(JSON.stringify(slicerBucket.projections[0].field)),
                    direction: "Ascending",
                },
            ],
        };
    }
    else if (visual.visual.query.sortDefinition) {
        delete visual.visual.query.sortDefinition;
    }
    if (opts.autoFilters) {
        visual.filterConfig = { filters: (0, pbir_js_1.buildAutoFilters)(queryState) };
    }
    return visual;
}
