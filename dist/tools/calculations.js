"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCalculationTools = registerCalculationTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
function registerCalculationTools(server, ctx) {
    // ============================================================
    // TOOL: list_visual_calculations
    // ============================================================
    server.tool("list_visual_calculations", "List all visual calculations on a visual. Visual calculations are DAX expressions scoped to the visual context (e.g. running totals, ranks).", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
    }, async ({ pageId, visualId }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const calculations = visual.visual.query?.calculations ?? [];
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ count: calculations.length, calculations }, null, 2),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: add_visual_calculation
    // ============================================================
    server.tool("add_visual_calculation", "Add a DAX visual calculation to a matrix or table visual. Examples: RUNNINGSUM([Sales]), RANK(), MOVINGAVERAGE([Value],3), PERCENTOFGRANDTOTAL([Value]), [Value]-PREVIOUS([Value]).", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        expression: zod_1.z
            .string()
            .describe("DAX expression (e.g. 'RUNNINGSUM([Sales Amount])')"),
        displayName: zod_1.z.string().describe("Display name shown in the visual"),
    }, async ({ pageId, visualId, expression, displayName }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        if (!visual.visual.query) {
            visual.visual.query = { queryState: {} };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query = visual.visual.query;
        if (!Array.isArray(query.calculations)) {
            query.calculations = [];
        }
        const name = (0, pbir_js_1.generateId)();
        const calc = { name, expression, displayName };
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
    });
    // ============================================================
    // TOOL: delete_visual_calculation
    // ============================================================
    server.tool("delete_visual_calculation", "Delete a visual calculation by name (get name from list_visual_calculations).", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().describe("The visual ID"),
        name: zod_1.z.string().describe("Calculation name (from list_visual_calculations)"),
    }, async ({ pageId, visualId, name }) => {
        const visual = ctx.project.getVisual(pageId, visualId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query = visual.visual.query;
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
        query.calculations = query.calculations.filter((c) => c.name !== name);
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
    });
}
