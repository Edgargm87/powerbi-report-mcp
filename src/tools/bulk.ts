import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryRef, buildNativeQueryRef, buildAutoFilters, VISUAL_BUCKETS } from "../pbir.js";
import type { Projection, QueryState } from "../pbir.js";
import {
  BucketBindingSchema,
  FormatCategorySchema,
  parseFieldSpec,
  SLICER_VISUAL_TYPES,
} from "../helpers/createVisual.js";
import { applyFormattingToTarget } from "../helpers/formatting.js";
import type { ServerContext } from "../context.js";
import { invalidateCache } from "../model-usage.js";

// Helper: accept both a real array and a JSON-stringified array (MCP serialisation quirk).
// The explicit `z.ZodType<T[]>` return cast is required because `z.preprocess` widens
// the output to `unknown` under strict mode — which breaks downstream `z.infer` chains
// (e.g. `bindings: parseArray(...)` would destructure as `unknown` instead of `T[]`).
function parseArray<T>(schema: z.ZodType<T>): z.ZodType<T[]> {
  return z.preprocess(
    (val) => (typeof val === "string" ? JSON.parse(val) : val),
    z.array(schema)
  ) as unknown as z.ZodType<T[]>;
}

export function registerBulkTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: bulk_delete_visuals
  // ============================================================
  server.tool(
    "bulk_delete_visuals",
    "Delete multiple visuals from a page in one call.",
    {
      pageId: z.string().describe("The page ID"),
      visualIds: parseArray(z.string()).describe("Visual IDs to delete"),
    },
    async ({ pageId, visualIds }) => {
      const deleted: string[] = [];
      const errors: string[] = [];

      for (const vid of visualIds) {
        try {
          ctx.project.deleteVisual(pageId, vid);
          deleted.push(vid);
        } catch (err) {
          errors.push(`${vid}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      invalidateCache();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, deleted: deleted.length, ids: deleted, errors }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: bulk_update_format
  // ============================================================
  server.tool(
    "bulk_update_format",
    "Apply the same formatting to multiple visuals in one call. target='container' for title/background/border, 'visual' for axes/legend/labels.",
    {
      pageId: z.string().describe("The page ID"),
      visualIds: parseArray(z.string()).describe("Visual IDs to format"),
      formatting: parseArray(FormatCategorySchema).describe("Formatting to apply to all visuals"),
      target: z
        .enum(["visual", "container"])
        .optional()
        .default("visual")
        .describe("'container' = title/background/border, 'visual' = axes/labels/legend"),
    },
    async ({ pageId, visualIds, formatting, target }) => {
      const updated: string[] = [];
      const errors: string[] = [];

      for (const vid of visualIds) {
        try {
          const visual = ctx.project.getVisual(pageId, vid);
          const targetObj =
            target === "container"
              ? (visual.visual.visualContainerObjects ??= {})
              : (visual.visual.objects ??= {});
          applyFormattingToTarget(targetObj as Record<string, unknown>, formatting);
          ctx.project.saveVisual(pageId, vid, visual);
          updated.push(vid);
        } catch (err) {
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
    }
  );

  // ============================================================
  // TOOL: bulk_bind
  // ============================================================
  server.tool(
    "bulk_bind",
    "Update data bindings on multiple visuals in one call. Each entry specifies a visualId and its new bindings. Replaces existing bindings entirely.",
    {
      pageId: z.string().describe("The page ID"),
      updates: parseArray(
        z.object({
          visualId: z.string().describe("Visual ID to rebind"),
          bindings: parseArray(BucketBindingSchema).describe("New bindings"),
        })
      ).describe("Array of {visualId, bindings} pairs"),
      autoFilters: z
        .boolean()
        .optional()
        .default(true)
        .describe("Rebuild auto-filters for each visual"),
    },
    async ({ pageId, updates, autoFilters }) => {
      const updated: string[] = [];
      const errors: string[] = [];

      for (const { visualId, bindings } of updates) {
        try {
          const visual = ctx.project.getVisual(pageId, visualId);
          const vType = visual.visual.visualType;

          // Build query state
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
                  (SLICER_VISUAL_TYPES.has(vType) && bucketName === "Values"));
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
          } else if (SLICER_VISUAL_TYPES.has(vType) && queryState.Values?.projections?.[0]) {
            visual.visual.query.sortDefinition = {
              sort: [
                {
                  field: JSON.parse(JSON.stringify(queryState.Values.projections[0].field)),
                  direction: "Ascending",
                },
              ],
            };
          } else if (visual.visual.query.sortDefinition) {
            delete visual.visual.query.sortDefinition;
          }

          if (autoFilters) {
            visual.filterConfig = { filters: buildAutoFilters(queryState) };
          }

          ctx.project.saveVisual(pageId, visualId, visual);
          updated.push(visualId);
        } catch (err) {
          errors.push(`${visualId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      invalidateCache();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, updated: updated.length, ids: updated, errors }),
          },
        ],
      };
    }
  );
}
