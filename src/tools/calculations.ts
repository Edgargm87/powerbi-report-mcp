import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

/**
 * Visual calculations — DAX expressions scoped to a visual's matrix/table context.
 * Stored as NativeVisualCalculation projections in queryState buckets.
 *
 * PBI Desktop format (inside a queryState bucket's projections array):
 *   {
 *     "field": {
 *       "NativeVisualCalculation": {
 *         "Language": "dax",
 *         "Expression": "RUNNINGSUM([Sum of Profit])",
 *         "Name": "Running sum"
 *       }
 *     },
 *     "queryRef": "select",
 *     "nativeQueryRef": "Running sum"
 *   }
 *
 * Common expressions:
 *   RUNNINGSUM([Sales Amount])          — running total down rows
 *   RANK()                              — rank within visual context
 *   MOVINGAVERAGE([Value], 3)           — 3-period moving average
 *   PERCENTOFGRANDTOTAL([Value])        — % of grand total
 *   [Value] - PREVIOUS([Value])         — period-on-period delta
 */

interface NativeVisualCalcProjection {
  field: {
    NativeVisualCalculation: {
      Language: string;
      Expression: string;
      Name: string;
    };
  };
  queryRef: string;
  nativeQueryRef: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isNativeCalc(proj: any): proj is NativeVisualCalcProjection {
  return proj?.field?.NativeVisualCalculation !== undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findValuesBucket(query: any): any[] | null {
  const qs = query?.queryState;
  if (!qs) return null;
  // Visual calculations are added to the first bucket that holds projections
  // (typically "Values" for tableEx, "Rows" for pivotTable)
  for (const bucket of ["Values", "Rows"]) {
    if (Array.isArray(qs[bucket]?.projections)) {
      return qs[bucket].projections;
    }
  }
  // Fallback: first bucket with projections
  for (const key of Object.keys(qs)) {
    if (Array.isArray(qs[key]?.projections)) {
      return qs[key].projections;
    }
  }
  return null;
}

export function registerCalculationTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: list_visual_calculations
  // ============================================================
  server.tool(
    "list_visual_calculations",
    "List all visual calculations on a visual. Visual calculations are DAX expressions scoped to the visual context (e.g. running totals, ranks).",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
    },
    async ({ pageId, visualId }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      const projections = findValuesBucket(visual.visual.query);
      const calcs = (projections ?? [])
        .filter(isNativeCalc)
        .map((p) => ({
          name: p.field.NativeVisualCalculation.Name,
          expression: p.field.NativeVisualCalculation.Expression,
          displayName: p.nativeQueryRef,
        }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: calcs.length, calculations: calcs }, null, 2),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: add_visual_calculation
  // ============================================================
  server.tool(
    "add_visual_calculation",
    "Add a DAX visual calculation to a matrix or table visual. Examples: RUNNINGSUM([Sales]), RANK(), MOVINGAVERAGE([Value],3), PERCENTOFGRANDTOTAL([Value]), [Value]-PREVIOUS([Value]).",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      expression: z
        .string()
        .describe("DAX expression (e.g. 'RUNNINGSUM([Sales Amount])')"),
      displayName: z.string().describe("Display name shown in the visual"),
    },
    async ({ pageId, visualId, expression, displayName }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      const projections = findValuesBucket(visual.visual.query);

      if (!projections) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: "No queryState bucket with projections found — visual calculations require a table/matrix visual with data bindings" }),
            },
          ],
        };
      }

      const calcProjection: NativeVisualCalcProjection = {
        field: {
          NativeVisualCalculation: {
            Language: "dax",
            Expression: expression,
            Name: displayName,
          },
        },
        queryRef: "select",
        nativeQueryRef: displayName,
      };

      projections.push(calcProjection);

      // Remove legacy calculations array if present
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = visual.visual.query as any;
      if (query?.calculations) {
        delete query.calculations;
      }

      ctx.project.saveVisual(pageId, visualId, visual);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, name: displayName, displayName, expression }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: delete_visual_calculation
  // ============================================================
  server.tool(
    "delete_visual_calculation",
    "Delete a visual calculation by name (get name from list_visual_calculations).",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().describe("The visual ID"),
      name: z.string().describe("Calculation name (from list_visual_calculations)"),
    },
    async ({ pageId, visualId, name }) => {
      const visual = ctx.project.getVisual(pageId, visualId);
      const projections = findValuesBucket(visual.visual.query);

      if (!projections) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: "No calculations found on this visual" }),
            },
          ],
        };
      }

      const before = projections.length;
      const filtered = projections.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => !(isNativeCalc(p) && p.field.NativeVisualCalculation.Name === name)
      );
      const removed = before - filtered.length;

      // Replace projections in-place
      projections.length = 0;
      projections.push(...filtered);

      // Remove legacy calculations array if present
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = visual.visual.query as any;
      if (query?.calculations) {
        delete query.calculations;
      }

      ctx.project.saveVisual(pageId, visualId, visual);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              removed,
              remaining: filtered.filter(isNativeCalc).length,
            }),
          },
        ],
      };
    }
  );
}
