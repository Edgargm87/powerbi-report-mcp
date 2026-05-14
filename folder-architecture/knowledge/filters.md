<!-- mirrored from skills/filters.md at v0.9.6 (08eda17) -->

<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
<!-- summary: Page/visual/report filter pane — pbir_add_page_filter, list/remove/clear filters, pbir_set_filter_pane visibility, visual interactions. Read when scoping data by filter. -->
# Skill: Filters — Page & Visual Filter Pane

## When to use
Use these patterns when the user asks for non-interactive filtering — pre-set the filter pane on a page or visual so it always restricts the data. For interactive filtering on the canvas use a slicer visual instead (see `skills/slicers.md`).

## Tool surface

| Tool | Purpose |
|---|---|
| `pbir_list_filters` | List filters on a page or visual (slim mode flattens fields to `Table[Column]`) |
| `pbir_add_page_filter` | Add a filter to a page (or visual when `visualId` provided) |
| `pbir_remove_filter` | Remove one filter by `name` |
| `pbir_clear_filters` | Remove ALL filters from a page or visual |

> Filters live in `filterConfig.filters` on `page.json` (page scope) or `visual.json` (visual scope). They are different from slicer **visuals**, which sit on the canvas as interactive controls.

---

## Filter Types

| filterType | What it does | Scope | When to use |
|---|---|---|---|
| `categorical` | Include specific values from a column | page or visual | "Show only East and West regions" |
| `topN` | Keep only top/bottom N items ranked by a field | **visual only** | "Show top 10 products by revenue" |
| `relativeDate` | Rolling date window relative to today | page or visual | "Last 90 days", "Next 2 quarters" |
| `advanced` | Comparison operators (Contains, GreaterThan, IsBlank…) with optional And/Or compound | page or visual | "Revenue > 1M and Country contains 'United'" |

`topN` is rejected at page scope by `pbir_add_page_filter` — always pass `visualId`.

---

## `pbir_list_filters`

Page-level:
```json
{ "pageId": "<pageId>" }
```

Visual-level:
```json
{ "pageId": "<pageId>", "visualId": "<visualId>" }
```

Returns `{ scope, count, filters: [{ name, type, field }] }`. Slim mode (default) flattens `field` to `"Table[Column]"`. Pass `slim: false` for the raw PBIR `FieldRef`.

---

## `pbir_add_page_filter`

### Categorical — specific values

```json
{
  "pageId": "<pageId>",
  "filterType": "categorical",
  "entity": "Store",
  "property": "Region",
  "values": ["East", "West"]
}
```

Omit `values` to add the field to the filter pane without pre-selecting (user picks at runtime):

```json
{ "pageId": "<pageId>", "filterType": "categorical", "entity": "Product", "property": "Category" }
```

### TopN — top/bottom N items (visual scope only)

```json
{
  "pageId": "<pageId>",
  "visualId": "<visualId>",
  "filterType": "topN",
  "entity": "Product",
  "property": "Name",
  "n": 10,
  "topNDirection": "Top",
  "orderByEntity": "Sales",
  "orderByProperty": "Total Revenue",
  "orderByIsMeasure": true
}
```

- `topNDirection`: `"Top"` (highest first) or `"Bottom"` (lowest first)
- `orderByIsMeasure`: `true` for DAX measures, `false` for columns (auto-wrapped in Sum)
- **`visualId` is required** — TopN at page scope is rejected

Rank by a column instead of a measure:
```json
{
  "pageId": "<pageId>", "visualId": "<visualId>",
  "filterType": "topN",
  "entity": "Product", "property": "Name",
  "n": 5, "topNDirection": "Bottom",
  "orderByEntity": "Product", "orderByProperty": "UnitPrice",
  "orderByIsMeasure": false
}
```

### RelativeDate — rolling date window

```json
{
  "pageId": "<pageId>",
  "filterType": "relativeDate",
  "entity": "Date",
  "property": "Date",
  "period": "months",
  "count": 3,
  "dateDirection": "last"
}
```

- `period`: `"days"` | `"weeks"` | `"months"` | `"quarters"` | `"years"`
- `dateDirection`: `"last"` (past) or `"next"` (future)

Common patterns:
```
Last 7 days     period=days     count=7   direction=last
Last 30 days    period=days     count=30  direction=last
Last 3 months   period=months   count=3   direction=last
Last 12 months  period=months   count=12  direction=last
Last 4 quarters period=quarters count=4   direction=last
Next 2 weeks    period=weeks    count=2   direction=next
```

### Advanced — comparison operators

Single condition:
```json
{
  "pageId": "<pageId>",
  "filterType": "advanced",
  "entity": "Sales",
  "property": "Revenue",
  "operator": "GreaterThan",
  "value": 1000000
}
```

Compound condition (And/Or, exactly two clauses):
```json
{
  "pageId": "<pageId>",
  "filterType": "advanced",
  "entity": "Customer",
  "property": "Country",
  "operator": "Contains",
  "value": "United",
  "logicalOperator": "And",
  "operator2": "DoesNotContain",
  "value2": "Emirates"
}
```

Operators:

| operator | Needs value | Notes |
|---|---|---|
| `Equals`, `NotEquals` | yes | Numeric or string |
| `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual` | yes | Numeric (number → `D` suffix) |
| `Contains`, `DoesNotContain` | yes (string) | Substring anywhere |
| `StartsWith`, `DoesNotStartWith` | yes (string) | Prefix match (`Kind: 1` in PBIR) |
| `IsBlank` | no | Tests for null/missing |
| `IsNotBlank` | no | Tests for present value |

Numbers serialize as `123D`, strings as `'foo'`. Pass `value` as a JS number for numeric comparisons, JS string for text.

---

## `pbir_remove_filter`

Get the filter `name` from `pbir_list_filters` first:

```json
// Page-level
{ "pageId": "<pageId>", "filterName": "<name>" }

// Visual-level
{ "pageId": "<pageId>", "visualId": "<visualId>", "filterName": "<name>" }
```

---

## `pbir_clear_filters`

```json
// All page filters
{ "pageId": "<pageId>" }

// All visual filters
{ "pageId": "<pageId>", "visualId": "<visualId>" }
```

---

## Filter vs Slicer — when to use which

| Need | Use |
|---|---|
| User interactively picks values | Slicer visual (`slicer`, `listSlicer`) |
| User types to search | Slicer visual (`textSlicer`) |
| User picks a date range | Slicer visual (`advancedSlicerVisual`) |
| Pre-filter the page to a fixed value set | `pbir_add_page_filter` categorical |
| Always show only last N months | `pbir_add_page_filter` relativeDate |
| Limit a visual to top N by measure | `pbir_add_page_filter` topN (visual scope) |
| Numeric / text condition (>, contains, blank) | `pbir_add_page_filter` advanced |
| Developer-defined non-interactive filter | `pbir_add_page_filter` |

---

## Workflow patterns

### Pre-filter a dashboard to last 12 months
```
pbir_add_page_filter filterType=relativeDate entity=Date property=Date period=months count=12 dateDirection=last
```

### Show only top 10 customers on a single visual
```
pbir_add_page_filter visualId=<id> filterType=topN entity=Customer property=Name n=10 topNDirection=Top
                orderByEntity=Sales orderByProperty="Total Revenue" orderByIsMeasure=true
```

### Filter to high-value rows
```
pbir_add_page_filter filterType=advanced entity=Sales property=Revenue operator=GreaterThan value=1000000
```

### Replace a filter
```
pbir_list_filters → find name
pbir_remove_filter filterName=<name>
pbir_add_page_filter (new filter)
```

### Reset everything
```
pbir_clear_filters pageId=<id>
```

---

## PBIR storage

Filters live in `filterConfig.filters` in:
- **Page scope** → `definition/pages/{pageId}/page.json`
- **Visual scope** → `definition/pages/{pageId}/visuals/{visualId}/visual.json`

Each entry has: `name` (generated id), `field` (FieldRef), `type` (`Categorical`/`TopN`/`RelativeDate`/`Advanced`), `filter` (the DAX-style query expression), and `howCreated: "User"`.
