// Shared visual-binding application logic.
//
// Both `pbir_update_visual_bindings` (single-visual) and `pbir_bulk_bind` (batch) used to
// inline the same ~60-line block: build queryState, handle the "Fields" bucket
// rewrite for visual types that don't support it, mark the first projection in
// Category (or slicer Values/Rows) as active, rebuild sortDefinition from the
// first Category projection (with isDefaultSort) or slicer projection, and
// optionally rebuild auto-filters. Drift risk was real: any fix to the slicer
// sort branch only ever got applied in one place.
//
// This helper centralises that behaviour. Both call sites now mutate the
// visual via this function and then saveVisual themselves.

import type { VisualDefinition } from "../pbir.js";
import { buildQueryRef, buildNativeQueryRef, buildAutoFilters, VISUAL_BUCKETS } from "../pbir.js";
import type { Projection, QueryState } from "../pbir.js";
import { parseFieldSpec, SLICER_VISUAL_TYPES } from "./createVisual.js";
import type { FieldSpecInput } from "./createVisual.js";

export interface BucketBindingInput {
  bucket: string;
  fields: FieldSpecInput[];
}

export interface ApplyBindingsOptions {
  autoFilters: boolean;
}

/**
 * Mutates `visual` in place with the new bindings and returns it for chaining.
 * Does NOT persist — caller is responsible for saveVisual.
 */
export function applyBindingsToVisual(
  visual: VisualDefinition,
  bindings: BucketBindingInput[],
  opts: ApplyBindingsOptions
): VisualDefinition {
  const vType = visual.visual.visualType;

  const queryState: QueryState = {};
  for (const binding of bindings) {
    let bucketName = binding.bucket;
    if (bucketName === "Fields") {
      const validBuckets = VISUAL_BUCKETS[vType as keyof typeof VISUAL_BUCKETS];
      if (validBuckets && validBuckets.length > 0 && !validBuckets.includes("Fields")) {
        bucketName = validBuckets[0];
      }
    }

    const projections: Projection[] = binding.fields.map((fieldSpec, i) => {
      const field = parseFieldSpec(fieldSpec);
      const isFirst =
        i === 0 &&
        (bucketName === "Category" ||
          (SLICER_VISUAL_TYPES.has(vType) && (bucketName === "Values" || bucketName === "Rows")));
      return {
        field,
        queryRef: buildQueryRef(field),
        nativeQueryRef: buildNativeQueryRef(field),
        ...(isFirst ? { active: true } : {}),
      };
    });
    queryState[bucketName] = { projections };
  }

  if (!visual.visual.query) {
    visual.visual.query = { queryState };
  } else {
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
  } else if (
    SLICER_VISUAL_TYPES.has(vType) &&
    (queryState.Values?.projections?.[0] || queryState.Rows?.projections?.[0])
  ) {
    const slicerBucket = queryState.Values ?? queryState.Rows;
    visual.visual.query.sortDefinition = {
      sort: [
        {
          field: JSON.parse(JSON.stringify(slicerBucket!.projections[0].field)),
          direction: "Ascending",
        },
      ],
    };
  } else if (visual.visual.query.sortDefinition) {
    delete visual.visual.query.sortDefinition;
  }

  if (opts.autoFilters) {
    visual.filterConfig = { filters: buildAutoFilters(queryState) };
  }

  return visual;
}
