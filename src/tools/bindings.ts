import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildQueryRef, buildNativeQueryRef, buildAutoFilters, VISUAL_BUCKETS } from "../pbir.js";
import type { Projection, QueryState } from "../pbir.js";
import { BucketBindingSchema, parseFieldSpec, SLICER_VISUAL_TYPES } from "../helpers/createVisual.js";
import type { ServerContext } from "../context.js";

export function registerBindingTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: update_visual_bindings
  // ============================================================
  server.tool(
    "update_visual_bindings",
    `Update the data bindings of an existing visual. Replaces the query state entirely. Supports Table[Column] shorthand: use { "field": "Sales[Net Price]", "type": "measure" } as an alternative to separate entity/property fields.`,
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      bindings: z.array(BucketBindingSchema).describe("New data bindings"),
      autoFilters: z.boolean().optional().default(true),
    },
    async ({ pageId, visualId, bindings, autoFilters }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
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
            (bucketName === "Category" || (SLICER_VISUAL_TYPES.has(vType) && bucketName === "Values"));
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
      } else if (SLICER_VISUAL_TYPES.has(vType) && queryState.Values?.projections?.[0]) {
        visual.visual.query.sortDefinition = {
          sort: [
            {
              field: JSON.parse(JSON.stringify(queryState.Values.projections[0].field)),
              direction: "Ascending",
            },
          ],
        };
      } else {
        if (visual.visual.query.sortDefinition) {
          delete visual.visual.query.sortDefinition;
        }
      }

      if (autoFilters) {
        visual.filterConfig = { filters: buildAutoFilters(queryState) };
      }

      ctx.project.saveVisual(pageId, visualId, visual);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, visualId }) }],
      };
    }
  );
}
