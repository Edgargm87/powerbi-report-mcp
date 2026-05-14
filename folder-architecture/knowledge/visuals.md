<!-- mirrored from skills/visuals.md at v0.9.6 (08eda17) -->

<!-- doc-version: 2.1 | Last updated: 2026-05-02 -->
<!-- summary: Visual-type picker, queryState role lookup table, bucket reference per type, binding shorthand, batch pbir_add_visual, pbir_change_visual_type, bulk delete. Read before any pbir_add_visual call. -->
# Skill: Visuals — Adding & Managing Chart/Data Visuals

## queryState role lookup — which buckets each visual type needs

Quick lookup — which projection roles each visual type needs in `queryState`. The exact bucket names are validated by `pbir_add_visual` and the binding coercion in `bindingApply.ts`. Source of truth: `VISUAL_BUCKETS` in `src/pbir.ts`.

| Visual type | Required / valid buckets | Notes |
|---|---|---|
| `barChart`, `clusteredBarChart`, `columnChart`, `clusteredColumnChart` | Category + Y (+ Series, Gradient) | Stacked variants drop Gradient |
| `stackedBarChart`, `hundredPercentStackedBarChart`, `hundredPercentStackedColumnChart` | Category + Y + Series | Series = stack legend |
| `lineChart`, `areaChart` | Category + Y (+ Y2, Series) | Y2 for dual-axis |
| `stackedAreaChart`, `hundredPercentStackedAreaChart` | Category + Y + Series | |
| `lineClusteredColumnComboChart`, `lineStackedColumnComboChart` | Category + Y (column) + Y2 (line) (+ Series) | Combo: Y=column, Y2=line. NOT ColumnY/LineY |
| `ribbonChart`, `ribbonChart2` | Category + Y + Series | |
| `waterfallChart` | Category + Y + Breakdown | |
| `scatterChart` | Category + X + Y + Size + Series | Dimension is Category, NOT Details |
| `pieChart`, `donutChart` | Category + Y (+ Series) | |
| `funnelChart`, `funnel` | Category + Y | |
| `treemap` | Group + Values + Details | Only visual that legitimately uses Details |
| `map` | Category + Size + Series | |
| `filledMap` | Location + Legend + Values | |
| `azureMap` | Category + Size | |
| `pivotTable` | Rows + Columns + Values | Multi-bucket |
| `tableEx` | Values | Single-bucket — all columns/measures go in Values |
| `card`, `multiRowCard` | Values | Single-bucket; `card` = single measure only |
| `cardVisual` | Data (+ Rows for small multiples) | New card visual; flexible Data array |
| `cardNew` | Fields | Fields bucket (not Values) |
| `kpi` | Indicator + TrendLine + Goal | Three different fields — don't pick this for "single number" |
| `gauge` | Y + MinValue + MaxValue + TargetValue | |
| `decompositionTreeVisual` | Analyze + ExplainBy | |
| `slicer`, `listSlicer`, `textSlicer` | Values | |
| `advancedSlicerVisual` | Rows | NOT Values — common gotcha |
| `textbox`, `basicShape`, `shape`, `image`, `actionButton`, `pageNavigator` | (none) | Container-only, no data binding |

## When to use
Use these patterns when asked to add charts, tables, cards, KPIs, shapes, buttons, images, or any visual to a Power BI report page.

## Tool surface

| Tool | Purpose |
|---|---|
| `pbir_add_visual` | Create one or more visuals via the `visuals` array. Inline format = 0 extra calls. |
| `pbir_get_visual` | Inspect one visual (slim by default — bindings as `Table[Field]` strings) |
| `pbir_list_visuals` | List all visuals on a page (slim mode = id, type, x, y, w, h, title). Optional `visualType` filters by exact type — pair with per-page iteration for cross-page sweeps. |
| `pbir_get_visual_types` | Dump the full visual-type → bucket map (use when you forget bucket names) |
| `pbir_move_visual` | Reposition / resize / re-layer one visual |
| `pbir_duplicate_visual` | Clone a visual, optionally to a different page, with x/y offset |
| `pbir_change_visual_type` | Swap a visual's type while keeping its bindings (e.g. barChart → columnChart) |
| `pbir_delete_visual` | Remove one visual from a page |
| `pbir_bulk_delete_visuals` | Remove many visuals in one call |

For batch reformat / rebind see `skills/formatting.md` and `pbir_bulk_bind`.

## `pbir_add_visual`

All calls pass the `visuals` array — one entry or many. One call, one round-trip, one set of side-effects (auto-z-order, cache invalidation).

```json
{
  "pageId": "<id>",
  "visuals": [
    { "visualType": "clusteredBarChart", "x": 20, "y": 80, "width": 560, "height": 300,
      "title": "Orders by Store",
      "bindings": [
        { "bucket": "Category", "fields": [{ "field": "Store[StoreName]", "type": "column" }] },
        { "bucket": "Y",        "fields": [{ "field": "Sales[Order Count]", "type": "measure" }] }
      ] }
  ]
}
```

Multiple visuals in one call:

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

Inline `containerFormat`, `visualFormat`, `dataColors`, `title`, `multiSelect`, `slicerMode`, etc. all work per-entry inside the `visuals` array.

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
| **"KPI" / "KPIs" / "KPI card" / "KPI tile" / "KPI strip" / "KPI row"** (default — user is talking about the *concept*) | **`card`** with a single measure — NOT `kpi` |
| The actual Power BI **KPI visual** (only when user names it explicitly, or asks for indicator + trend line + goal together) | `kpi` |
| Card (classic, single value) | `card` |
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

When in doubt, call `pbir_get_visual_types` — it dumps the live bucket map straight from `pbir.ts`.

### Chart naming gotcha
- `columnChart` is **stacked** column (Series bucket = stack)
- `barChart` is **stacked** bar (Series bucket = stack)
- For unstacked, use `clusteredColumnChart` / `clusteredBarChart` explicitly

## Bucket Names by Visual Type

| Visual | Buckets |
|---|---|
| columnChart, barChart, clusteredColumnChart, clusteredBarChart, etc. | Category, Y, Series |
| lineChart, areaChart, stackedAreaChart | Category, Y, Y2, Series |
| **lineStackedColumnComboChart** | Category, **Y** (column), **Y2** (line), Series |
| **lineClusteredColumnComboChart** | Category, **Y** (column), **Y2** (line), Series |
| pieChart, donutChart | Category, Y |
| **scatterChart** | **Category**, X, Y, Size, Series |
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
**Combo charts** — use `Y` (column series) and `Y2` (line series), same naming as `lineChart`. (Earlier revisions of this doc said `ColumnY`/`LineY` — that was wrong. Desktop's PBIR writer uses `Y`/`Y2`.)
**`kpi` vs `card` vs `cardVisual`** — three different visuals, different binding shapes:
- `kpi` — compound visual. Needs **three different fields**: Indicator (the value) + TrendLine (the prior-period series) + Goal (the target). Don't pick this unless the user really wants all three.
- `card` (classic) — **single `Values` field only**. One measure, one number. Binding two fields here is wrong.
- `cardVisual` (new card) — **flexible**. Legit patterns:
  1. `Data: [measure]` → single-measure callout
  2. `Data: [measure, referenceMeasure, …]` → callout + one or more reference values (e.g. current + SPLY)
  3. `Data: [measure]` + `Rows: [category]` → one small-multiple card per row value
- When a user says "KPI card" with **one number**, pick `card` or `cardVisual` (1 measure), never `kpi`.
**scatterChart dimension** — use `Category` (verified against Fabric schema v2.7.0 and Desktop-generated PBIR). Earlier revisions said `Details` — that was wrong. Only `treemap` legitimately uses `Details` as a separate bucket.
**advancedSlicerVisual** — dimension bucket is `Rows`, not `Values`.

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

Auto-renders one button per visible page. Hide pages with `pbir_set_page_visibility` to keep them out of the navigator.

### `shape` and `textbox`
See `skills/shapes.md` for the full shape API (rounded rectangles, lines, tab cuts, embedded text labels via `objects.text`).

## Inline Formatting

`pbir_add_visual` accepts three inline formatting branches that save extra `pbir_format_visual` round-trips:

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

## `pbir_change_visual_type`

Swap a visual's type without losing bindings. Useful when the user says "actually make that a clustered bar":

```json
{
  "pageId": "<id>",
  "visualId": "<id>",
  "visualType": "clusteredBarChart"
}
```

Caveats:
- Only works when the new type accepts the existing buckets. Going from `columnChart` (Category, Y, Series) → `clusteredBarChart` (same buckets) is safe. Going to `pivotTable` (Rows, Columns, Values) is not — you'll need `pbir_update_visual_bindings` (see `skills/formatting.md`) afterwards.
- Visual-level formatting (axes, legend) may carry over awkwardly. Re-`pbir_format_visual` if it looks wrong.

## `pbir_delete_visual` and `pbir_bulk_delete_visuals`

```json
// Single
{ "pageId": "<id>", "visualId": "<id>" }

// Bulk — small operation (≤5 visuals), no confirmation required
{ "pageId": "<id>", "visualIds": ["<id1>", "<id2>", "<id3>"] }

// Bulk — large operation (>5 visuals), requires confirmBulk
{ "pageId": "<id>", "visualIds": ["<id1>", ..., "<id9>"], "confirmBulk": true }
```

Both invalidate the pbir_model_usage cache.

### Bulk safety gate

`pbir_bulk_delete_visuals`, `pbir_bulk_update_format`, and `pbir_bulk_bind` all enforce a safety threshold: **if the operation would affect more than 5 visuals and `confirmBulk` is not set to `true`, the call errors out** with a structured message naming the count and the threshold. This prevents the common failure mode of "agent lists every visual on a page, pipes the id array straight into a bulk tool, and wipes the page."

When you get a safety-gate error:
- If you meant to operate on that many visuals, re-issue the call with `confirmBulk: true`.
- If you didn't, narrow the id list (e.g. filter by type or name prefix using `pbir_list_visuals` results).
- Never set `confirmBulk: true` reflexively — the gate exists to force a second thought.

### Binding validation

`pbir_add_visual`, `pbir_update_visual_bindings`, and `pbir_bulk_bind` all validate every field reference against the semantic model **before any write**. A typo like `Sales[FooBar]` used to silently produce a broken visual that only surfaced when the user opened PBI Desktop — now it fails the call upfront with a structured error and "did you mean" suggestions.

**How it works.** The validator reads the sibling `.SemanticModel` folder (same source as `pbir_model_usage`), builds a per-table inventory of columns and measures, and checks each `FieldSpecInput` in the `bindings` array. Extension measures from `reportExtensions.json` are merged in. Calc-group items are exposed as measures. When the model can't be located (live-connect, missing sibling folder, parse error) validation **silently skips** — it never blocks a legitimate workflow just because the model is unreadable.

**Three modes**, controlled per-call via `strictBindings` or globally via the `MCP_BINDING_VALIDATION` env var:

| Mode | Per-call | Env var | Behaviour on unknown field |
|------|----------|---------|----------------------------|
| **strict** (default) | `strictBindings: true` | `MCP_BINDING_VALIDATION=strict` | Call errors out, nothing is written |
| **warn** | `strictBindings: false` | `MCP_BINDING_VALIDATION=warn` | Call proceeds, errors attached as `bindingWarnings` |
| **off** | — | `MCP_BINDING_VALIDATION=off` | Validation skipped entirely |

Precedence: per-call param > env var > default (strict).

**Error reasons.** Each validation error carries a stable `reason` code:
- `table_not_found` — entity name doesn't match any table
- `column_not_found` / `measure_not_found` — field not in table for its kind
- `type_mismatch_column_is_measure` — spec says `type: "column"` but it's actually a measure
- `type_mismatch_measure_is_column` — spec says `type: "measure"` but it's a column (use `type: "aggregation"` instead)
- `parse_error` — field shorthand doesn't match `Table[Column]` pattern

**Example strict-mode error response:**
```json
{
  "success": false,
  "error": "Binding validation failed (2 issues):\n  • Sales[FooBar] (column): column not found in table 'Sales'. Did you mean: Sales[Quantity]?\n  • Slaes[Total Sales] (measure): table 'Slaes' not found in model. Did you mean: Sales[Total Sales]?\nValidation runs against the sibling .SemanticModel folder + report extension measures. To bypass for a single call set strictBindings: false, or set MCP_BINDING_VALIDATION=off globally.",
  "bindingErrors": [ /* structured per-error objects */ ],
  "mode": "strict"
}
```

**What to do when you hit a validation error:**
1. Read the error list — every unknown field is named with its suggested replacement.
2. If the suggestion is right, fix the spec and re-issue. Most errors are one-character typos or wrong casing.
3. If the field genuinely doesn't exist yet (e.g. you're binding against a measure that a sibling MCP is about to add), set `strictBindings: false` on that single call to let it through as a warning. Don't set `MCP_BINDING_VALIDATION=off` globally — you'd lose the safety net for every other call.
4. If the field exists but the validator can't see it, the sibling `.SemanticModel` folder may be missing or stale. Run `pbir_model_usage` first to confirm; if that also can't find the field, the model is the source of truth and the binding really is broken.

Case-sensitivity: field names are matched exactly — `sales[quantity]` is treated as a missing table. PBI Desktop is case-sensitive here too. The "did you mean" suggestions use case-insensitive Levenshtein, so a casing mistake will surface the correctly-cased name as the top suggestion.

**Measure home table — auto-resolution.** Measures should ideally be referenced by their **home table** (the table where the measure is defined in TMDL/BIM), not by a fact table that the LLM happens to associate with the metric. A common failure mode: the LLM writes `Sales[Total Revenue]` when `Total Revenue` is actually authored on `_Measures` — Power BI Desktop happily accepts the file but renders no data because `SourceRef.Entity` points at the wrong table.

The MCP auto-corrects this when the measure name lives in **exactly one** other table. The response then carries a `bindingAutoCorrections` array so the correction is visible:

```json
{
  "success": true,
  "...": "...",
  "bindingAutoCorrections": [
    { "from": "Sales[Total Revenue]", "to": "_Measures[Total Revenue]", "reason": "measure home table" }
  ]
}
```

When the LLM sees this in a response, it should update its mental model of which table holds which measures and use the corrected entity on subsequent calls.

When the measure name exists in **multiple** tables, auto-correction can't pick a winner — the call fails strict validation with `measure_not_found` and the suggestions list each candidate as `_Table[Measure] (candidate home table)`. Pick one and re-issue. Auto-correction never applies to columns or aggregations: those are bound to physical tables and there is no such thing as a column "home table".

## Common workflows

### Create a page then populate it
1. `pbir_create_page` → get `pageId`
2. `pbir_add_visual` (batch mode) — all shapes for the wireframe layer
3. `pbir_add_visual` (batch mode) — all data visuals with inline `title`, `containerFormat`, `dataColors`
4. `pbir_set_report_theme` for global brand
5. `pbir_reload_report`

### Inspect what's on a page
- `pbir_list_visuals` (slim) — id, type, x, y, w, h, title
- `pbir_get_visual` (slim) — bindings as `Table[Field]` strings, position, filterCount, plus `slicerMode`/`multiSelect` for slicers
- `pbir_list_pages({includeVisuals: true})` — replaces `pbir_list_pages` + N×`pbir_list_visuals` in one call

### Rearrange visuals
- `pbir_move_visual` to reposition/resize/re-layer one visual
- `pbir_auto_layout` to reflow all visuals into a grid (mostly useful as a starting point)

### Clone a visual
- `pbir_duplicate_visual` with optional `targetPageId` and `offsetX`/`offsetY` (filter IDs are regenerated)
