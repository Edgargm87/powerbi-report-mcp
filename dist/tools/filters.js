"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFilterTools = registerFilterTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
// --- Helper: build a Categorical filter ---
function buildCategoricalFilter(entity, property, values) {
    const field = (0, pbir_js_1.columnRef)(entity, property);
    const filter = {
        Categorical: {
            ...(values && values.length > 0
                ? {
                    Values: values.map((v) => [
                        { Literal: { Value: `'${v}'` } },
                    ]),
                }
                : {}),
        },
    };
    return {
        name: (0, pbir_js_1.generateId)(),
        field,
        type: "Categorical",
        howCreated: "User",
        filter: values && values.length > 0 ? filter : undefined,
        objects: { general: [{ properties: {} }] },
    };
}
// --- Helper: build a TopN filter ---
function buildTopNFilter(entity, property, n, direction, orderByEntity, orderByProperty, orderByIsMeasure) {
    const field = (0, pbir_js_1.columnRef)(entity, property);
    const orderByField = orderByIsMeasure
        ? (0, pbir_js_1.measureRef)(orderByEntity, orderByProperty)
        : (0, pbir_js_1.columnRef)(orderByEntity, orderByProperty);
    const filter = {
        TopN: {
            ItemCount: n,
            Ordered: direction === "Top" ? 2 : 1, // 2=descending(Top), 1=ascending(Bottom)
            OrderBy: [{ QueryRef: { Name: `${orderByEntity}.${orderByProperty}` }, Direction: direction === "Top" ? 2 : 1 }],
            By: orderByField,
        },
    };
    return {
        name: (0, pbir_js_1.generateId)(),
        field,
        type: "TopN",
        howCreated: "User",
        filter,
        objects: { general: [{ properties: {} }] },
    };
}
// --- Helper: build a RelativeDate filter ---
function buildRelativeDateFilter(entity, property, period, count, direction) {
    const field = (0, pbir_js_1.columnRef)(entity, property);
    // Power BI period type mapping
    const periodMap = {
        days: 0,
        weeks: 1,
        months: 2,
        quarters: 3,
        years: 4,
    };
    // Direction: 0 = last (past), 1 = next (future)
    const directionValue = direction === "last" ? 0 : 1;
    const filter = {
        RelativeDate: {
            TimeUnitsCount: count,
            TimeUnitType: periodMap[period],
            OperatorType: directionValue,
            IncludeToday: true,
        },
    };
    return {
        name: (0, pbir_js_1.generateId)(),
        field,
        type: "RelativeDate",
        howCreated: "User",
        filter,
        objects: { general: [{ properties: {} }] },
    };
}
function registerFilterTools(server, ctx) {
    // ============================================================
    // TOOL: list_filters
    // ============================================================
    server.tool("list_filters", "List all filters on a page or a specific visual. Filters are stored in filterConfig of page.json (page-level) or visual.json (visual-level).", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().optional().describe("Visual ID — omit to list page-level filters"),
    }, async ({ pageId, visualId }) => {
        let filters = [];
        let scope;
        if (visualId) {
            const visual = ctx.project.getVisual(pageId, visualId);
            filters = visual.filterConfig?.filters ?? [];
            scope = `visual:${visualId}`;
        }
        else {
            const page = ctx.project.getPage(pageId);
            filters = page.filterConfig?.filters ?? [];
            scope = `page:${pageId}`;
        }
        const summary = filters.map((f) => ({
            name: f.name,
            type: f.type,
            field: f.field,
        }));
        return {
            content: [{ type: "text", text: JSON.stringify({ scope, count: filters.length, filters: summary }, null, 2) }],
        };
    });
    // ============================================================
    // TOOL: add_page_filter
    // ============================================================
    server.tool("add_page_filter", `Add a filter to a page (page-level filter affects all visuals on the page). Supports three filter types:
- **categorical**: include/exclude specific values from a column. Omit 'values' to show the filter panel without pre-selecting values.
- **topN**: show only the top/bottom N items ranked by a measure or column.
- **relativeDate**: rolling date window (last/next N days/weeks/months/quarters/years).`, {
        pageId: zod_1.z.string().describe("The page ID to add the filter to"),
        filterType: zod_1.z
            .enum(["categorical", "topN", "relativeDate"])
            .describe("Type of filter to add"),
        // Field to filter
        entity: zod_1.z.string().describe("Table name for the filter field (e.g. 'Date', 'Product')"),
        property: zod_1.z.string().describe("Column name to filter on (e.g. 'Year', 'Category')"),
        // Categorical options
        values: zod_1.z
            .array(zod_1.z.string())
            .optional()
            .describe("For categorical: specific values to include (e.g. ['East', 'West'])"),
        // TopN options
        n: zod_1.z.number().optional().describe("For topN: number of items to show"),
        topNDirection: zod_1.z
            .enum(["Top", "Bottom"])
            .optional()
            .default("Top")
            .describe("For topN: 'Top' (highest) or 'Bottom' (lowest)"),
        orderByEntity: zod_1.z.string().optional().describe("For topN: table of the ranking field"),
        orderByProperty: zod_1.z.string().optional().describe("For topN: column/measure to rank by"),
        orderByIsMeasure: zod_1.z
            .boolean()
            .optional()
            .default(false)
            .describe("For topN: true if orderBy field is a DAX measure"),
        // RelativeDate options
        period: zod_1.z
            .enum(["days", "weeks", "months", "quarters", "years"])
            .optional()
            .describe("For relativeDate: time unit"),
        count: zod_1.z.number().optional().describe("For relativeDate: number of periods"),
        dateDirection: zod_1.z
            .enum(["last", "next"])
            .optional()
            .default("last")
            .describe("For relativeDate: 'last' (past) or 'next' (future)"),
    }, async ({ pageId, filterType, entity, property, values, n, topNDirection, orderByEntity, orderByProperty, orderByIsMeasure, period, count, dateDirection, }) => {
        let newFilter;
        if (filterType === "categorical") {
            newFilter = buildCategoricalFilter(entity, property, values);
        }
        else if (filterType === "topN") {
            if (!n || !orderByEntity || !orderByProperty) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ success: false, error: "topN requires: n, orderByEntity, orderByProperty" }) }],
                };
            }
            newFilter = buildTopNFilter(entity, property, n, topNDirection ?? "Top", orderByEntity, orderByProperty, orderByIsMeasure ?? false);
        }
        else {
            if (!period || !count) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ success: false, error: "relativeDate requires: period, count" }) }],
                };
            }
            newFilter = buildRelativeDateFilter(entity, property, period, count, dateDirection ?? "last");
        }
        const page = ctx.project.getPage(pageId);
        if (!page.filterConfig)
            page.filterConfig = { filters: [] };
        page.filterConfig.filters.push(newFilter);
        ctx.project.savePage(pageId, page);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({ success: true, filterId: newFilter.name, filterType, entity, property }),
                }],
        };
    });
    // ============================================================
    // TOOL: remove_filter
    // ============================================================
    server.tool("remove_filter", "Remove a specific filter by name from a page or visual.", {
        pageId: zod_1.z.string().describe("The page ID"),
        filterName: zod_1.z.string().describe("The filter name/ID to remove (from list_filters)"),
        visualId: zod_1.z.string().optional().describe("Visual ID — omit to remove from page-level filters"),
    }, async ({ pageId, filterName, visualId }) => {
        if (visualId) {
            const visual = ctx.project.getVisual(pageId, visualId);
            const before = visual.filterConfig?.filters?.length ?? 0;
            if (visual.filterConfig?.filters) {
                visual.filterConfig.filters = visual.filterConfig.filters.filter((f) => f.name !== filterName);
            }
            ctx.project.saveVisual(pageId, visualId, visual);
            const after = visual.filterConfig?.filters?.length ?? 0;
            return {
                content: [{ type: "text", text: JSON.stringify({ success: true, scope: "visual", removed: before - after }) }],
            };
        }
        else {
            const page = ctx.project.getPage(pageId);
            const before = page.filterConfig?.filters?.length ?? 0;
            if (page.filterConfig?.filters) {
                page.filterConfig.filters = page.filterConfig.filters.filter((f) => f.name !== filterName);
            }
            ctx.project.savePage(pageId, page);
            const after = page.filterConfig?.filters?.length ?? 0;
            return {
                content: [{ type: "text", text: JSON.stringify({ success: true, scope: "page", removed: before - after }) }],
            };
        }
    });
    // ============================================================
    // TOOL: clear_filters
    // ============================================================
    server.tool("clear_filters", "Remove ALL filters from a page or a specific visual.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().optional().describe("Visual ID — omit to clear all page-level filters"),
    }, async ({ pageId, visualId }) => {
        if (visualId) {
            const visual = ctx.project.getVisual(pageId, visualId);
            const count = visual.filterConfig?.filters?.length ?? 0;
            if (visual.filterConfig)
                visual.filterConfig.filters = [];
            ctx.project.saveVisual(pageId, visualId, visual);
            return {
                content: [{ type: "text", text: JSON.stringify({ success: true, scope: "visual", cleared: count }) }],
            };
        }
        else {
            const page = ctx.project.getPage(pageId);
            const count = page.filterConfig?.filters?.length ?? 0;
            if (page.filterConfig)
                page.filterConfig.filters = [];
            ctx.project.savePage(pageId, page);
            return {
                content: [{ type: "text", text: JSON.stringify({ success: true, scope: "page", cleared: count }) }],
            };
        }
    });
}
