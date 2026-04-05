"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFilterTools = registerFilterTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
// --- Helper: flatten a PBIR FieldRef to "Table[Field]" string ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fieldRefToString(field) {
    const f = field;
    if (f?.Column)
        return `${f.Column.Expression?.SourceRef?.Entity}[${f.Column.Property}]`;
    if (f?.Measure)
        return `${f.Measure.Expression?.SourceRef?.Entity}[${f.Measure.Property}]`;
    if (f?.Aggregation?.Expression?.Column) {
        const col = f.Aggregation.Expression.Column;
        return `${col.Expression?.SourceRef?.Entity}[${col.Property}]`;
    }
    return JSON.stringify(field);
}
// --- Helper: unique short alias for a table name (avoids collision when same first letter) ---
function alias(entity, existing = []) {
    let a = entity.charAt(0).toLowerCase();
    let i = 2;
    while (existing.includes(a))
        a = entity.charAt(0).toLowerCase() + i++;
    return a;
}
// --- Helper: build a Categorical filter ---
// PBIR requires From/Where DAX query format — NOT { Categorical: {} }
function buildCategoricalFilter(entity, property, values) {
    const field = (0, pbir_js_1.columnRef)(entity, property);
    const src = alias(entity);
    let filter;
    if (values && values.length > 0) {
        filter = {
            From: [{ Name: src, Entity: entity, Type: 0 }],
            Where: [{
                    Condition: {
                        In: {
                            Expressions: [{
                                    Column: {
                                        Expression: { SourceRef: { Source: src } },
                                        Property: property,
                                    },
                                }],
                            Values: values.map((v) => [{ Literal: { Value: `'${v}'` } }]),
                        },
                    },
                }],
        };
    }
    return { name: (0, pbir_js_1.generateId)(), field, type: "Categorical", ...(filter ? { filter } : {}) };
}
// --- Helper: build a TopN filter ---
// PBIR requires From/Where DAX query format — NOT { TopN: {} }
function buildTopNFilter(entity, property, n, direction, orderByEntity, orderByProperty, orderByIsMeasure) {
    const field = (0, pbir_js_1.columnRef)(entity, property);
    const src = alias(entity);
    const ord = alias(orderByEntity, [src]);
    const fromList = [{ Name: src, Entity: entity, Type: 0 }];
    if (orderByEntity !== entity)
        fromList.push({ Name: ord, Entity: orderByEntity, Type: 0 });
    const orderBySource = orderByEntity !== entity ? ord : src;
    const orderByExpr = orderByIsMeasure
        ? { Measure: { Expression: { SourceRef: { Source: orderBySource } }, Property: orderByProperty } }
        : { Column: { Expression: { SourceRef: { Source: orderBySource } }, Property: orderByProperty } };
    const filter = {
        From: fromList,
        Where: [{
                Condition: {
                    TopN: {
                        Expression: {
                            Column: {
                                Expression: { SourceRef: { Source: src } },
                                Property: property,
                            },
                        },
                        ItemCount: n,
                        OrderBy: [{ Direction: direction === "Top" ? 2 : 1, Expression: orderByExpr }],
                    },
                },
            }],
    };
    return { name: (0, pbir_js_1.generateId)(), field, type: "TopN", filter };
}
// --- Helper: build a RelativeDate filter ---
// PBIR requires From/Where DAX query format — NOT { RelativeDate: {} }
function buildRelativeDateFilter(entity, property, period, count, direction) {
    const field = (0, pbir_js_1.columnRef)(entity, property);
    const src = alias(entity);
    const periodMap = { days: 0, weeks: 1, months: 2, quarters: 3, years: 4 };
    const filter = {
        From: [{ Name: src, Entity: entity, Type: 0 }],
        Where: [{
                Condition: {
                    RelativeDate: {
                        Expression: {
                            Column: {
                                Expression: { SourceRef: { Source: src } },
                                Property: property,
                            },
                        },
                        TimeUnitsCount: count,
                        TimeUnitType: periodMap[period],
                        OperatorType: direction === "last" ? 0 : 1,
                        IncludeToday: true,
                    },
                },
            }],
    };
    return { name: (0, pbir_js_1.generateId)(), field, type: "RelativeDate", filter };
}
function registerFilterTools(server, ctx) {
    // ============================================================
    // TOOL: list_filters
    // ============================================================
    server.tool("list_filters", "List filters on a page or visual. Slim mode (default) flattens field refs to 'Table[Column]' strings. Set slim=false for full PBIR field objects.", {
        pageId: zod_1.z.string().describe("The page ID"),
        visualId: zod_1.z.string().optional().describe("Visual ID — omit for page-level filters"),
        slim: zod_1.z.boolean().optional().default(true).describe("Slim mode (default true) — flattens field ref to Table[Column] string"),
    }, async ({ pageId, visualId, slim }) => {
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
            field: slim ? fieldRefToString(f.field) : f.field,
        }));
        return {
            content: [{ type: "text", text: JSON.stringify({ scope, count: filters.length, filters: summary }, null, 2) }],
        };
    });
    // ============================================================
    // TOOL: add_page_filter
    // ============================================================
    server.tool("add_page_filter", "Add a page-level filter (affects all visuals). Types: categorical (specific values), topN (top/bottom N by measure), relativeDate (rolling date window).", {
        pageId: zod_1.z.string().describe("The page ID to add the filter to"),
        filterType: zod_1.z
            .enum(["categorical", "topN", "relativeDate"])
            .describe("Type of filter to add"),
        // Field to filter
        entity: zod_1.z.string().describe("Table name of the filter field"),
        property: zod_1.z.string().describe("Column to filter on"),
        // Categorical options
        values: zod_1.z
            .array(zod_1.z.string())
            .optional()
            .describe("categorical: values to include"),
        // TopN options
        n: zod_1.z.number().optional().describe("topN: number of items"),
        topNDirection: zod_1.z
            .enum(["Top", "Bottom"])
            .optional()
            .default("Top")
            .describe("topN: Top or Bottom"),
        orderByEntity: zod_1.z.string().optional().describe("topN: table of ranking field"),
        orderByProperty: zod_1.z.string().optional().describe("topN: column/measure to rank by"),
        orderByIsMeasure: zod_1.z
            .boolean()
            .optional()
            .default(false)
            .describe("topN: true if ranking field is a measure"),
        // RelativeDate options
        period: zod_1.z
            .enum(["days", "weeks", "months", "quarters", "years"])
            .optional()
            .describe("relativeDate: time unit"),
        count: zod_1.z.number().optional().describe("relativeDate: number of periods"),
        dateDirection: zod_1.z
            .enum(["last", "next"])
            .optional()
            .default("last")
            .describe("relativeDate: last (past) or next (future)"),
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
