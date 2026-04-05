# Skill: Filters — Page & Visual Filters

## Tools

| Tool | Purpose |
|---|---|
| `list_filters` | List all filters on a page or visual |
| `add_page_filter` | Add a filter to a page (affects all visuals on the page) |
| `remove_filter` | Remove one filter by name/ID |
| `clear_filters` | Remove ALL filters from a page or visual |

> **Note:** These tools manage PBIR filter config (the filter pane). They are different from slicers — slicers are interactive visuals; filters are embedded in `filterConfig.filters` in `page.json` or `visual.json`.

---

## Filter Types

| filterType | What it does | When to use |
|---|---|---|
| `categorical` | Include/exclude specific values from a column | "Show only East and West regions" |
| `topN` | Keep only top/bottom N items ranked by a field | "Show top 10 products by revenue" |
| `relativeDate` | Rolling date window relative to today | "Last 90 days", "Next 2 quarters" |

---

## list_filters

```json
{
  "pageId": "<pageId>"
}
```

To list visual-level filters:
```json
{
  "pageId": "<pageId>",
  "visualId": "<visualId>"
}
```

Returns: `{ scope, count, filters: [{ name, type, field }] }`

---

## add_page_filter

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

Omit `values` to add the filter to the pane without pre-selecting values (user selects in filter panel):
```json
{
  "pageId": "<pageId>",
  "filterType": "categorical",
  "entity": "Product",
  "property": "Category"
}
```

### TopN — top/bottom N items

```json
{
  "pageId": "<pageId>",
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
- `orderByIsMeasure`: `true` for DAX measures, `false` for columns

Rank by a column (not a measure):
```json
{
  "pageId": "<pageId>",
  "filterType": "topN",
  "entity": "Product",
  "property": "Name",
  "n": 5,
  "topNDirection": "Bottom",
  "orderByEntity": "Product",
  "orderByProperty": "UnitPrice",
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
- `IncludeToday` is always `true`

Common patterns:
```
Last 7 days:    period=days,    count=7,  direction=last
Last 30 days:   period=days,    count=30, direction=last
Last 3 months:  period=months,  count=3,  direction=last
Last 12 months: period=months,  count=12, direction=last
Last 4 quarters:period=quarters,count=4,  direction=last
Next 2 weeks:   period=weeks,   count=2,  direction=next
Year to date:   period=years,   count=1,  direction=last
```

---

## remove_filter

Get the filter name from `list_filters` first, then remove it:

```json
{
  "pageId": "<pageId>",
  "filterName": "<name-from-list_filters>"
}
```

Remove from a visual:
```json
{
  "pageId": "<pageId>",
  "visualId": "<visualId>",
  "filterName": "<name>"
}
```

---

## clear_filters

Remove all filters from a page:
```json
{
  "pageId": "<pageId>"
}
```

Remove all filters from a visual:
```json
{
  "pageId": "<pageId>",
  "visualId": "<visualId>"
}
```

---

## Workflow Patterns

### Add a date range filter to a dashboard page
```
1. list_pages → get pageId
2. add_page_filter: filterType=relativeDate, entity=Date, property=Date, period=months, count=12, dateDirection=last
```

### Filter a page to a specific segment
```
1. add_page_filter: filterType=categorical, entity=financials, property=Segment, values=["Enterprise","Midmarket"]
```

### Show only top 10 customers by sales
```
1. add_page_filter: filterType=topN, entity=Customer, property=Name, n=10, topNDirection=Top, orderByEntity=Sales, orderByProperty=[Total Sales], orderByIsMeasure=true
```

### Replace a filter (remove old, add new)
```
1. list_filters → find the filter name
2. remove_filter: filterName=<name>
3. add_page_filter: (new filter)
```

### Reset all filters on a page
```
1. clear_filters: pageId=<id>
```

---

## Filter vs Slicer — when to use which

| Need | Use |
|---|---|
| User interactively picks values | Slicer visual (`slicer`, `listSlicer`) |
| User types to search | Slicer visual (`textSlicer`) |
| User picks a date range | Slicer visual (`advancedSlicerVisual`) |
| Pre-filter page to a fixed value set | `add_page_filter` categorical |
| Always show only last N months | `add_page_filter` relativeDate |
| Limit page to top N by measure | `add_page_filter` topN |
| Developer-defined, non-interactive filter | `add_page_filter` |

---

## PBIR Storage

Filters are stored in `filterConfig.filters` in the target file:
- **Page filter** → `definition/pages/{pageId}/page.json`
- **Visual filter** → `definition/pages/{pageId}/visuals/{visualId}/visual.json`

Each filter item has: `name` (generated ID), `field` (FieldRef), `type`, `filter` (filter expression), `howCreated: "User"`.
