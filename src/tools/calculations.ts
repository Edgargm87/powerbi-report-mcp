import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateId } from "../pbir.js";
import type { ServerContext } from "../context.js";

/**
 * Visual calculations — DAX expressions scoped to a visual's matrix/table context.
 * Stored in visual.query.calculations[] in PBIR format.
 *
 * Common expressions:
 *   RUNNINGSUM([Sales Amount])          — running total down rows
 *   RANK()                              — rank within visual context
 *   MOVINGAVERAGE([Value], 3)           — 3-period moving average
 *   PERCENTOFGRANDTOTAL([Value])        — % of grand total
 *   [Value] - PREVIOUS([Value])         — period-on-period delta
 *
 * Note: visual calculations only apply to matrix/table visuals and require
 * Power BI Desktop Feb 2024+ to render. Use get_visual(slim=false) to inspect
 * the raw calculations array if needed.
 */

interface VisualCalculation {
  name: string;
  expression: string;
  displayName: string;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calculations: VisualCalculation[] = (visual.visual.query as any)?.calculations ?? [];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: calculations.length, calculations }, null, 2),
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

      if (!visual.visual.query) {
        visual.visual.query = { queryState: {} };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = visual.visual.query as any;
      if (!Array.isArray(query.calculations)) {
        query.calculations = [];
      }

      const name = generateId();
      const calc: VisualCalculation = { name, expression, displayName };
      query.calculations.push(calc);

      ctx.project.saveVisual(pageId, visualId, visual);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, name, displayName, expression }),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = visual.visual.query as any;

      if (!Array.isArray(query?.calculations) || query.calculations.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: "No calculations found on this visual" }),
            },
          ],
        };
      }

      const before = query.calculations.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query.calculations = query.calculations.filter((c: any) => c.name !== name);
      ctx.project.saveVisual(pageId, visualId, visual);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              removed: before - query.calculations.length,
              remaining: query.calculations.length,
            }),
          },
        ],
      };
    }
  );
}
