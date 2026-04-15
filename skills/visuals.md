<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
# Skill: Visuals — Adding & Managing Chart/Data Visuals

## When to use
Use these patterns when asked to add charts, tables, cards, KPIs, shapes, buttons, images, or any visual to a Power BI report page.

## Tool surface

| Tool | Purpose |
|---|---|
| `add_visual` | Create one visual (single mode) or many (batch mode). Inline format = 0 extra calls. |
| `get_visual` | Inspect one visual (slim by default — bindings as `Table[Field]` strings) |
| `list_visuals` | List all visuals on a page (slim mode = id, type, x, y, w, h, title) |
| `get_visual_types` | Dump the full visual-type → bucket map (use when you forget bucket names) |
| `move_visual` | Reposition / resize / re-layer one visual |
| `duplicate_visual` | Clone a visual, optionally to a different page, with x/y offset |
| `change_visual_type` | Swap a visual's type while keeping its bindings (e.g. barChart → columnChart) |
| `delete_visual` | Remove one visual from a page |
| `bulk_delete_visuals` | Remove many visuals in one call |

For batch creation use `add_visual` batch mode. For batch reformat / rebind see `skills/formatting.md` and `bulk_bind`.

## `add_visual` — single mode

```json
{
  "pageId": "<id>",
  "visualType": "clusteredBarChart",
  "x": 20, "y": 80,
  "width": 560, "height": 300,
  "title": "Orders by Store",
  "bindings": [
    { "bucket": "Category", "fields": [{ "field": "Store[StoreName]", "type": "column" }] },
    { "bucket": "Y",        "fields": [{ "field": "Sales[Order Count]", "type": "measure" }] }
  ]
}
```

## `add_visual` — batch mode

When you need more than one visual on a page, **always use batch mode**. One call, one round-trip, one set of side-effects (auto-z-order, cache invalidation).

```json
{
  "pageId": "<id>",
  "visuals": [
    { "visualType": "card", "x": 0, "y": 0, "width": 160, "height": 80,
      "title": "Total Revenue",
      "bindings": [{ "bucket": "Values", "fields": [{ "field": "Sales[Total Revenue]", "type": "measure" }] }] },
    { "visualType": "lineChart", "x": 170, "y": 0, "width": 560, "height": 280,
      "title": "Revenue Trend",
      "bindings": [
        { "bucket": "Category", "fields": [{ "field": "Date[Year]", "type": "column" }] },
        { "bucket": "Y",        "fields": [{ "field": "Sales[Total Revenue]", "type": "measure" }] }
      ] }
  ]
}
```

When `visuals` is provided, the top-level single-mode params (`visualType`, `x`, `y`, `width`, `height`, `bindings`, …) are ignored. Inline `containerFormat`, `visualFormat`, `dataColors`, `title`, `multiSelect`, `slicerMode`, etc. all work per-entry inside the `visuals` array.

## Visual Type Reference

| User says | visualType |
|---|---|
| Stacked column | `columnChart` |
| Clustered column | `clusteredColumnChart` |
| 100% stacked column | `hundredPercentStackedColumnChart` |
| Stacked bar (horizontal) | `barChart` (alias `stackedBarChart`) |
| Clustered bar (horizontal) | `clusteredBarChart` |
| 100% stacked bar | `hundredPercentStackedBarChart` |
| Line chart | `lineChart` |
| Area chart | `areaChart` |
| Stacked area | `stackedAreaChart` |
| Pie chart | `pieChart` |
| Donut chart | `donutChart` |
| Scatter | `scatterChart` |
| KPI | `kpi` |
| Card (classic) | `card` |
| Card (new visual) | `cardVisual` |
| Multi-row card | `multiRowCard` |
| Table | `tableEx` |
| Matrix | `pivotTable` |
| Gauge | `gauge` |
| Funnel | `funnelChart` |
| Treemap | `treemap` |
| Waterfall | `waterfallChart` |
| Ribbon | `ribbonChart` |
| Line + stacked column combo | `lineStackedColumnComboChart` |
| Line + clustered column combo | `lineClusteredColumnComboChart` |
| Azure Map | `azureMap` |
| Map | `map` |
| Filled map | `filledMap` |
| Decomposition tree | `decompositionTreeVisual` |
| Page navigator | `pageNavigator` |
| Action button | `actionButton` |
| Shape | `shape` |
| Textbox | `textbox` |
| Image | `image` |
| Slicer (Dropdown/Basic) | `slicer` |
| List slicer | `listSlicer` |
| Text slicer | `textSlicer` |
| Advanced slicer | `advancedSlicerVisual` |

When in doubt, call `get_visual_types` — it dumps the live bucket map straight from `pbir.ts`.

### Chart naming gotcha
- `columnChart` is **stacked** column (Series bucket = stack)
- `barChart` is **stacked** bar (Series bucket = stack)
- For unstacked, use `clusteredColumnChart` / `clusteredBarChart` explicitly

## Bucket Names by Visual Type

| Visual | Buckets |
|---|---|
| columnChart, barChart, clusteredColumnChart, clusteredBarChart, etc. | Category, Y, Series |
| lineChart, areaChart, stackedAreaChart | Category, Y, Y2, Series |
| **lineStackedColumnComboChart** | Category, **ColumnY**, **LineY**, Series |
| **lineClusteredColumnComboChart** | Category, **ColumnY**, **LineY**, Series |
| pieChart, donutChart | Category, Y |
| **scatterChart** | **Details**, X, Y, Size, Series — use "Details" not "Category" |
| card, multiRowCard | Values |
| **cardVisual** | **Data** |
| tableEx | Values |
| pivotTable | Rows, Columns, Values |
| kpi | Indicator, TrendLine, Goal |
| gauge | Y, MinValue, MaxValue, TargetValue |
| treemap | Group, Values, Details |
| waterfallChart | Category, Y, Breakdown |
| funnelChart | Category, Y |
| azureMap | Category, Size |
| map | Category, Size, Series |
| filledMap | Location, Legend, Values |
| decompositionTreeVisual | Analyze, ExplainBy |
| slicer, listSlicer, textSlicer, advancedSlicerVisual | Values |

**Series bucket** = breakdown/legend field for stacked charts.
**ColumnY / LineY** — combo charts use separate Y buckets, not Y/Y2.
**Details** — scatter chart uses Details (not Category) for the dimension field.

## Field Spec — Table[Column] shorthand

```json
// Shorthand (recommended)
{ "field": "Sales[Net Price]", "type": "measure" }
{ "field": "Date[Year]",       "type": "column" }
{ "field": "financials[Gross Sales]", "type": "aggregation", "aggregation": "Sum" }

// Verbose (also accepted)
{ "entity": "Sales", "property": "Net Price", "type": "measure" }
```

Aggregation functions: `Sum`, `Avg`, `Count`, `Min`, `Max`, `CountNonNull`, `Median`, `StandardDeviation`, `Variance`.

## Container-only visuals (no data binding)

`actionButton`, `pageNavigator`, `image`, `shape`, `textbox` don't take `bindings`. The first three automatically get `howCreated: "InsertVisualButton"` in the PBIR.

### `image`

```json
{
  "visualType": "image",
  "x": 20, "y": 20, "width": 200, "height": 60,
  "imageUrl": "https://example.com/logo.png",
  "imageScaling": "fit"
}
```

`imageScaling`: `"fit"` (default) | `"fill"` | `"normal"`.

### `actionButton`

```json
{
  "visualType": "actionButton",
  "x": 20, "y": 660, "width": 120, "height": 40,
  "buttonText": "Reset",
  "buttonAction": "back"
}
```

`buttonAction`: `"pageNavigation"` | `"URL"` | `"bookmark"` | `"back"`.
`buttonActionTarget`: page ID for `pageNavigation`, URL for `URL`, bookmark display name for `bookmark`. Omitted for `back`.

### `pageNavigator`

```json
{ "visualType": "pageNavigator", "x": 0, "y": 0, "width": 1280, "height": 40 }
```

Auto-renders one button per visible page. Hide pages with `set_page_visibility` to keep them out of the navigator.

### `shape` and `textbox`
See `skills/shapes.md` for the full shape API (rounded rectangles, lines, tab cuts, embedded text labels via `objects.text`).

## Inline Formatting

`add_visual` accepts three inline formatting branches that save extra `format_visual` round-trips:

```json
{
  "containerFormat": [
    { "category": "background", "properties": { "show": true, "color": "#FFFFFF", "transparency": 0 } },
    { "category": "border",     "properties": { "show": true, "color": "#E0E0E0", "radius": 8 } }
  ],
  "visualFormat": [
    { "category": "categoryAxis", "properties": { "fontSize": 9 } }
  ],
  "dataColors": [{ "color": "#4A90D9" }, { "color": "#50B748" }]
}
```

`containerFormat` writes to `visualContainerObjects` (title/background/border/padding/dropShadow/visualHeader). `visualFormat` writes to `objects` (axes/legend/labels/dataPoint). `dataColors` is a shortcut for the first dataPoint series colors. See `skills/formatting.md` for the full category catalog.

## `change_visual_type`

Swap a visual's type without losing bindings. Useful when the user says "actually make that a clustered bar":

```json
{
  "pageId": "<id>",
  "visualId": "<id>",
  "visualType": "clusteredBarChart"
}
```

Caveats:
- Only works when the new type accepts the existing buckets. Going from `columnChart` (Category, Y, Series) → `clusteredBarChart` (same buckets) is safe. Going to `pivotTable` (Rows, Columns, Values) is not — you'll need `update_visual_bindings` (see `skills/formatting.md`) afterwards.
- Visual-level formatting (axes, legend) may carry over awkwardly. Re-`format_visual` if it looks wrong.

## `delete_visual` and `bulk_delete_visuals`

```json
// Single
{ "pageId": "<id>", "visualId": "<id>" }

// Bulk — small operation (≤5 visuals), no confirmation required
{ "pageId": "<id>", "visualIds": ["<id1>", "<id2>", "<id3>"] }

// Bulk — large operation (>5 visuals), requires confirmBulk
{ "pageId": "<id>", "visualIds": ["<id1>", ..., "<id9>"], "confirmBulk": true }
```

Both invalidate the model_usage cache.

### Bulk safety gate

`bulk_delete_visuals`, `bulk_update_format`, and `bulk_bind` all enforce a safety threshold: **if the operation would affect more than 5 visuals and `confirmBulk` is not set to `true`, the call errors out** with a structured message naming the count and the threshold. This prevents the common failure mode of "agent lists every visual on a page, pipes the id array straight into a bulk tool, and wipes the page."

When you get a safety-gate error:
- If you meant to operate on that many visuals, re-issue the call with `confirmBulk: true`.
- If you didn't, narrow the id list (e.g. filter by type or name prefix using `list_visuals` results).
- Never set `confirmBulk: true` reflexively — the gate exists to force a second thought.

## Common workflows

### Create a page then populate it
1. `create_page` → get `pageId`
2. `add_visual` (batch mode) — all shapes for the wireframe layer
3. `add_visual` (batch mode) — all data visuals with inline `title`, `containerFormat`, `dataColors`
4. `set_report_theme` for global brand
5. `reload_report`

### Inspect what's on a page
- `list_visuals` (slim) — id, type, x, y, w, h, title
- `get_visual` (slim) — bindings as `Table[Field]` strings, position, filterCount, plus `slicerMode`/`multiSelect` for slicers
- `get_page_summary` — replaces `list_pages` + N×`list_visuals` in one call

### Rearrange visuals
- `move_visual` to reposition/resize/re-layer one visual
- `auto_layout` to reflow all visuals into a grid (mostly useful as a starting point)

### Clone a visual
- `duplicate_visual` with optional `targetPageId` and `offsetX`/`offsetY` (filter IDs are regenerated)
