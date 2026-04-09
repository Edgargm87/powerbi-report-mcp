import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateId, columnRef } from "../pbir.js";
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

// --- Helper: unique short alias for a table name (avoids collision when same first letter) ---
function alias(entity: string, existing: string[] = []): string {
  let a = entity.charAt(0).toLowerCase();
  let i = 2;
  while (existing.includes(a)) a = entity.charAt(0).toLowerCase() + i++;
  return a;
}

// --- Helper: build a Categorical filter ---
// PBIR requires From/Where DAX query format — NOT { Categorical: {} }
function buildCategoricalFilter(
  entity: string,
  property: string,
  values?: string[]
): FilterItem {
  const field = columnRef(entity, property);
  const src = alias(entity);

  let filter: Record<string, unknown> | undefined;
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

  return { name: generateId(), field, type: "Categorical", ...(filter ? { filter } : {}) };
}

// --- Helper: build a TopN filter ---
// PBIR TopN uses a subquery pattern: outer From has a Subquery entry (Type:2) + category table.
// Where uses In with Table referencing the subquery — NOT a TopN condition inside Where.
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
  const catAlias = alias(entity);
  const ordAlias = alias(orderByEntity, [catAlias]);
  const pbiDirection = direction === "Top" ? 2 : 1; // 2=Descending, 1=Ascending

  // Inner from: always includes category table; add orderBy table only if different entity
  const innerFrom: unknown[] = [{ Name: catAlias, Entity: entity, Type: 0 }];
  if (orderByEntity !== entity) innerFrom.push({ Name: ordAlias, Entity: orderByEntity, Type: 0 });

  // OrderBy expression: Aggregation(Sum) for columns, Measure for DAX measures
  const ordSrc = orderByEntity !== entity ? ordAlias : catAlias;
  const orderByExpr = orderByIsMeasure
    ? { Measure: { Expression: { SourceRef: { Source: ordSrc } }, Property: orderByProperty } }
    : { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Source: ordSrc } }, Property: orderByProperty } }, Function: 0 } };

  const filter = {
    Version: 2,
    From: [
      {
        Name: "subquery",
        Expression: {
          Subquery: {
            Query: {
              Version: 2,
              From: innerFrom,
              Select: [{
                Column: { Expression: { SourceRef: { Source: catAlias } }, Property: property },
                Name: "field",
              }],
              OrderBy: [{ Direction: pbiDirection, Expression: orderByExpr }],
              Top: n,
            },
          },
        },
        Type: 2,
      },
      { Name: catAlias, Entity: entity, Type: 0 },
    ],
    Where: [{
      Condition: {
        In: {
          Expressions: [{ Column: { Expression: { SourceRef: { Source: catAlias } }, Property: property } }],
          Table: { SourceRef: { Source: "subquery" } },
        },
      },
    }],
  };

  return { name: generateId(), field, type: "TopN", filter, howCreated: "User" } as unknown as FilterItem;
}

// --- Helper: build a RelativeDate filter ---
// Confirmed format from PBI Desktop: Condition.Between with DateSpan/DateAdd expressions.
// "last N years" → LowerBound = DateSpan(DateAdd(DateAdd(Now,+1,Day),-N,Unit), Day)
//                  UpperBound = DateSpan(Now, Day)
// TimeUnit for DateAdd: days=0, weeks=1, months=2, years=3
// Quarters use months×3 (no native quarter unit in DateAdd).
function buildRelativeDateFilter(
  entity: string,
  property: string,
  period: "days" | "weeks" | "months" | "quarters" | "years",
  count: number,
  direction: "last" | "next"
): FilterItem {
  const field = columnRef(entity, property);
  const src = alias(entity);

  // TimeUnit for DateAdd (observed: years=3 from PBI Desktop)
  const unitMap: Record<string, number> = { days: 0, weeks: 1, months: 2, quarters: 2, years: 3 };
  const addUnit = unitMap[period];
  const addAmount = period === "quarters" ? count * 3 : count;

  const colExpr = {
    Column: {
      Expression: { SourceRef: { Source: src } },
      Property: property,
    },
  };

  const nowPlusOne = { DateAdd: { Expression: { Now: {} }, Amount: 1, TimeUnit: 0 } };

  // "last": LowerBound = start of (tomorrow - N), UpperBound = start of today
  // "next": LowerBound = start of today, UpperBound = start of (yesterday + N)
  const lowerExpr = direction === "last"
    ? { DateSpan: { Expression: { DateAdd: { Expression: nowPlusOne, Amount: -addAmount, TimeUnit: addUnit } }, TimeUnit: 0 } }
    : { DateSpan: { Expression: { Now: {} }, TimeUnit: 0 } };

  const upperExpr = direction === "last"
    ? { DateSpan: { Expression: { Now: {} }, TimeUnit: 0 } }
    : { DateSpan: { Expression: { DateAdd: { Expression: { DateAdd: { Expression: { Now: {} }, Amount: -1, TimeUnit: 0 } }, Amount: addAmount, TimeUnit: addUnit } }, TimeUnit: 0 } };

  const filter = {
    Version: 2,
    From: [{ Name: src, Entity: entity, Type: 0 }],
    Where: [{
      Condition: {
        Between: {
          Expression: colExpr,
          LowerBound: lowerExpr,
          UpperBound: upperExpr,
        },
      },
    }],
  };

  return { name: generateId(), field, type: "RelativeDate", filter, howCreated: "User" } as unknown as FilterItem;
}

// --- Helper: build an Advanced filter ---
// Advanced filters use comparison conditions (Equals, GreaterThan, Contains, etc.)
// Supports single condition or compound (And/Or) with two conditions.
function buildAdvancedFilter(
  entity: string,
  property: string,
  operator: string,
  value?: string | number,
  logicalOperator?: "And" | "Or",
  operator2?: string,
  value2?: string | number
): FilterItem {
  const field = columnRef(entity, property);
  const src = alias(entity);

  const colExpr = {
    Column: {
      Expression: { SourceRef: { Source: src } },
      Property: property,
    },
  };

  // Map operator names to PBIR Comparison kinds
  const opMap: Record<string, number> = {
    Equals: 0, NotEquals: 1,
    GreaterThan: 2, GreaterThanOrEqual: 3,
    LessThan: 4, LessThanOrEqual: 5,
  };

  function buildCondition(op: string, val?: string | number): Record<string, unknown> {
    // Unary operators (no value needed)
    if (op === "IsBlank") {
      return { Not: { Expression: { Exists: { Expression: colExpr } } } };
    }
    if (op === "IsNotBlank") {
      return { Exists: { Expression: colExpr } };
    }
    // String operators
    if (op === "Contains" || op === "DoesNotContain" || op === "StartsWith" || op === "DoesNotStartWith") {
      const strVal = typeof val === "string" ? val : String(val ?? "");
      const containsExpr = {
        Contains: { Left: colExpr, Right: { Literal: { Value: `'${strVal}'` } } },
      };
      if (op === "DoesNotContain") return { Not: { Expression: containsExpr } };
      if (op === "StartsWith") {
        return { Contains: { Left: colExpr, Right: { Literal: { Value: `'${strVal}'` } }, Kind: 1 } };
      }
      if (op === "DoesNotStartWith") {
        return { Not: { Expression: { Contains: { Left: colExpr, Right: { Literal: { Value: `'${strVal}'` } }, Kind: 1 } } } };
      }
      return containsExpr;
    }
    // Comparison operators
    const kind = opMap[op];
    if (kind === undefined) throw new Error(`Unknown operator: ${op}`);
    const litValue = typeof val === "number" ? `${val}D` : `'${val}'`;
    return {
      Comparison: {
        ComparisonKind: kind,
        Left: colExpr,
        Right: { Literal: { Value: litValue } },
      },
    };
  }

  let whereCondition: Record<string, unknown>;
  if (logicalOperator && operator2) {
    const cond1 = buildCondition(operator, value);
    const cond2 = buildCondition(operator2, value2);
    whereCondition = logicalOperator === "And"
      ? { And: { Left: cond1, Right: cond2 } }
      : { Or: { Left: cond1, Right: cond2 } };
  } else {
    whereCondition = buildCondition(operator, value);
  }

  const filter = {
    Version: 2,
    From: [{ Name: src, Entity: entity, Type: 0 }],
    Where: [{ Condition: whereCondition }],
  };

  return { name: generateId(), field, type: "Advanced", filter, howCreated: "User" } as unknown as FilterItem;
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
    "Add a filter to a page or visual. Omit visualId for page-level (affects all visuals). Provide visualId for visual-level. NOTE: topN filters only work at visual level — always provide visualId when filterType is topN. Types: categorical (specific values), topN (top/bottom N by measure), relativeDate (rolling date window), advanced (comparison operators like GreaterThan, Contains, IsBlank — supports compound And/Or conditions).",
    {
      pageId: z.string().describe("The page ID"),
      visualId: z.string().optional().describe("Visual ID — omit for page-level, required for topN"),
      filterType: z
        .enum(["categorical", "topN", "relativeDate", "advanced"])
        .describe("Type of filter to add. topN requires visualId."),
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
      // Advanced options
      operator: z.string().optional().describe("advanced: comparison operator (Equals, NotEquals, GreaterThan, GreaterThanOrEqual, LessThan, LessThanOrEqual, Contains, DoesNotContain, StartsWith, DoesNotStartWith, IsBlank, IsNotBlank)"),
      value: z.union([z.string(), z.number()]).optional().describe("advanced: comparison value"),
      logicalOperator: z.enum(["And", "Or"]).optional().describe("advanced: compound condition connector"),
      operator2: z.string().optional().describe("advanced: second operator for compound conditions"),
      value2: z.union([z.string(), z.number()]).optional().describe("advanced: second comparison value"),
    },
    async ({
      pageId, visualId, filterType, entity, property, values,
      n, topNDirection, orderByEntity, orderByProperty, orderByIsMeasure,
      period, count, dateDirection,
      operator, value, logicalOperator, operator2, value2,
    }) => {
      if (filterType === "topN" && !visualId) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "topN filters must be applied at visual level — provide visualId" }) }],
        };
      }

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
      } else if (filterType === "advanced") {
        if (!operator) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "advanced requires: operator" }) }],
          };
        }
        newFilter = buildAdvancedFilter(entity, property, operator, value, logicalOperator, operator2, value2);
      } else {
        if (!period || !count) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "relativeDate requires: period, count" }) }],
          };
        }
        newFilter = buildRelativeDateFilter(entity, property, period, count, dateDirection ?? "last");
      }

      if (visualId) {
        const visual = ctx.project.getVisual(pageId, visualId);
        if (!visual.filterConfig) visual.filterConfig = { filters: [] };
        visual.filterConfig.filters.push(newFilter);
        ctx.project.saveVisual(pageId, visualId, visual);
      } else {
        const page = ctx.project.getPage(pageId);
        if (!page.filterConfig) page.filterConfig = { filters: [] };
        page.filterConfig.filters.push(newFilter);
        ctx.project.savePage(pageId, page);
      }

      const scope = visualId ? "visual" : "page";
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, filterId: newFilter.name, filterType, entity, property, scope }),
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
