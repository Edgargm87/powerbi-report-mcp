import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateId, columnRef, measureRef } from "../pbir.js";
import type { FilterItem, FieldRef } from "../pbir.js";
import type { ServerContext } from "../context.js";

// --- Helper: flatten a PBIR FieldRef to "Table[Field]" string ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fieldRefToString(field: FieldRef): string {
  const f = field as any;
  if (f?.Column) return `${f.Column.Expression?.SourceRef?.Entity}[${f.Column.Property}]`;
  if (f?.Measure) return `${f.Measure.Expression?.SourceRef?.Entity}[${f.Measure.Property}]`;
  if (f?.Aggregation?.Expression?.Column) {
    const col = f.Aggregation.Expression.Column;
    return `${col.Expression?.SourceRef?.Entity}[${col.Property}]`;
  }
  return JSON.stringify(field);
}

// --- Helper: build a Categorical filter ---
function buildCategoricalFilter(
  entity: string,
  property: string,
  values?: string[]
): FilterItem {
  const field = columnRef(entity, property);
  const filter: Record<string, unknown> = {
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
    name: generateId(),
    field,
    type: "Categorical",
    howCreated: "User",
    filter: values && values.length > 0 ? filter : undefined,
    objects: { general: [{ properties: {} }] },
  } as FilterItem & { howCreated?: string; objects?: unknown };
}

// --- Helper: build a TopN filter ---
function buildTopNFilter(
  entity: string,
  property: string,
  n: number,
  direction: "Top" | "Bottom",
  orderByEntity: string,
  orderByProperty: string,
  orderByIsMeasure: boolean
): FilterItem {
  const field = columnRef(entity, property);
  const orderByField: FieldRef = orderByIsMeasure
    ? measureRef(orderByEntity, orderByProperty)
    : columnRef(orderByEntity, orderByProperty);

  const filter = {
    TopN: {
      ItemCount: n,
      Ordered: direction === "Top" ? 2 : 1, // 2=descending(Top), 1=ascending(Bottom)
      OrderBy: [{ QueryRef: { Name: `${orderByEntity}.${orderByProperty}` }, Direction: direction === "Top" ? 2 : 1 }],
      By: orderByField,
    },
  };

  return {
    name: generateId(),
    field,
    type: "TopN",
    howCreated: "User",
    filter,
    objects: { general: [{ properties: {} }] },
  } as FilterItem & { howCreated?: string; objects?: unknown };
}

// --- Helper: build a RelativeDate filter ---
function buildRelativeDateFilter(
  entity: string,
  property: string,
  period: "days" | "weeks" | "months" | "quarters" | "years",
  count: number,
  direction: "last" | "next"
): FilterItem {
  const field = columnRef(entity, property);

  // Power BI period type mapping
  const periodMap: Record<string, number> = {
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
    name: generateId(),
    field,
    type: "RelativeDate",
    howCreated: "User",
    filter,
    objects: { general: [{ properties: {} }] },
  } as FilterItem & { howCreated?: string; objects?: unknown };
}

export function registerFilterTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: list_filters
  // ============================================================
  server.tool(
    "list_filters",
    "List filters on a page or visual. Slim mode (default) flattens field refs to 'Table[Column]' strings. Set slim=false for full PBIR field objects.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().optional().describe("Visual ID — omit for page-level filters"),
      slim: z.boolean().optional().default(true).describe("Slim mode (default true) — flattens field ref to Table[Column] string"),
    },
    async ({ pageId, visualId, slim }) => {
      let filters: FilterItem[] = [];
      let scope: string;

      if (visualId) {
        const visual = ctx.project.getVisual(pageId, visualId);
        filters = visual.filterConfig?.filters ?? [];
        scope = `visual:${visualId}`;
      } else {
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
    }
  );

  // ============================================================
  // TOOL: add_page_filter
  // ============================================================
  server.tool(
    "add_page_filter",
    "Add a page-level filter (affects all visuals). Types: categorical (specific values), topN (top/bottom N by measure), relativeDate (rolling date window).",
    {
      pageId: z.string().describe("The page ID to add the filter to"),
      filterType: z
        .enum(["categorical", "topN", "relativeDate"])
        .describe("Type of filter to add"),
      // Field to filter
      entity: z.string().describe("Table name of the filter field"),
      property: z.string().describe("Column to filter on"),
      // Categorical options
      values: z
        .array(z.string())
        .optional()
        .describe("categorical: values to include"),
      // TopN options
      n: z.number().optional().describe("topN: number of items"),
      topNDirection: z
        .enum(["Top", "Bottom"])
        .optional()
        .default("Top")
        .describe("topN: Top or Bottom"),
      orderByEntity: z.string().optional().describe("topN: table of ranking field"),
      orderByProperty: z.string().optional().describe("topN: column/measure to rank by"),
      orderByIsMeasure: z
        .boolean()
        .optional()
        .default(false)
        .describe("topN: true if ranking field is a measure"),
      // RelativeDate options
      period: z
        .enum(["days", "weeks", "months", "quarters", "years"])
        .optional()
        .describe("relativeDate: time unit"),
      count: z.number().optional().describe("relativeDate: number of periods"),
      dateDirection: z
        .enum(["last", "next"])
        .optional()
        .default("last")
        .describe("relativeDate: last (past) or next (future)"),
    },
    async ({
      pageId, filterType, entity, property, values,
      n, topNDirection, orderByEntity, orderByProperty, orderByIsMeasure,
      period, count, dateDirection,
    }) => {
      let newFilter: FilterItem;

      if (filterType === "categorical") {
        newFilter = buildCategoricalFilter(entity, property, values);
      } else if (filterType === "topN") {
        if (!n || !orderByEntity || !orderByProperty) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "topN requires: n, orderByEntity, orderByProperty" }) }],
          };
        }
        newFilter = buildTopNFilter(entity, property, n, topNDirection ?? "Top", orderByEntity, orderByProperty, orderByIsMeasure ?? false);
      } else {
        if (!period || !count) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "relativeDate requires: period, count" }) }],
          };
        }
        newFilter = buildRelativeDateFilter(entity, property, period, count, dateDirection ?? "last");
      }

      const page = ctx.project.getPage(pageId);
      if (!page.filterConfig) page.filterConfig = { filters: [] };
      page.filterConfig.filters.push(newFilter);
      ctx.project.savePage(pageId, page);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, filterId: newFilter.name, filterType, entity, property }),
        }],
      };
    }
  );

  // ============================================================
  // TOOL: remove_filter
  // ============================================================
  server.tool(
    "remove_filter",
    "Remove a specific filter by name from a page or visual.",
    {
      pageId: z.string().describe("The page ID"),
      filterName: z.string().describe("The filter name/ID to remove (from list_filters)"),
      visualId: z.string().optional().describe("Visual ID — omit to remove from page-level filters"),
    },
    async ({ pageId, filterName, visualId }) => {
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
      } else {
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
    }
  );

  // ============================================================
  // TOOL: clear_filters
  // ============================================================
  server.tool(
    "clear_filters",
    "Remove ALL filters from a page or a specific visual.",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().optional().describe("Visual ID — omit to clear all page-level filters"),
    },
    async ({ pageId, visualId }) => {
      if (visualId) {
        const visual = ctx.project.getVisual(pageId, visualId);
        const count = visual.filterConfig?.filters?.length ?? 0;
        if (visual.filterConfig) visual.filterConfig.filters = [];
        ctx.project.saveVisual(pageId, visualId, visual);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, scope: "visual", cleared: count }) }],
        };
      } else {
        const page = ctx.project.getPage(pageId);
        const count = page.filterConfig?.filters?.length ?? 0;
        if (page.filterConfig) page.filterConfig.filters = [];
        ctx.project.savePage(pageId, page);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, scope: "page", cleared: count }) }],
        };
      }
    }
  );
}
