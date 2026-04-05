# Skill: Visuals — Adding & Managing Chart/Data Visuals

## When to use
Use these patterns when asked to add charts, tables, cards, KPIs, or any data-bound visual to a Power BI report page.

## Core tool: `add_visual`

### Single mode
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

### Batch mode (multiple visuals in one call)
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

## Visual Type Reference (all 32 supported types)

| User says | visualType |
|---|---|
| Stacked column | `columnChart` |
| Clustered column | `clusteredColumnChart` |
| 100% stacked column | `hundredPercentStackedColumnChart` |
| Stacked bar (horizontal) | `barChart` |
| Stacked bar (explicit) | `stackedBarChart` |
| Clustered bar (horizontal) | `clusteredBarChart` |
| 100% stacked bar | `hundredPercentStackedBarChart` |
| Line chart | `lineChart` |
| Area chart | `areaChart` |
| Stacked area | `stackedAreaChart` |
| Pie chart | `pieChart` |
| Donut chart | `donutChart` |
| Scatter | `scatterChart` |
| KPI | `kpi` |
| Card (old) | `card` |
| Card (new visual) | `cardNew` |
| Card visual | `cardVisual` |
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
| Slicer | `slicer` |
| List slicer | `listSlicer` |
| Text slicer | `textSlicer` |
| Advanced slicer | `advancedSlicerVisual` |

## Bucket Names by Visual Type

| Visual | Buckets |
|---|---|
| columnChart, barChart, stackedBarChart, clusteredColumnChart, clusteredBarChart | Category, Y, Series |
| lineChart, areaChart, stackedAreaChart | Category, Y, Y2, Series |
| **lineStackedColumnComboChart** | Category, **ColumnY**, **LineY**, Series |
| **lineClusteredColumnComboChart** | Category, **ColumnY**, **LineY**, Series |
| pieChart, donutChart | Category, Y |
| **scatterChart** | **Details**, X, Y, Size, Series — NOTE: use "Details" not "Category" |
| card, multiRowCard | Values |
| **cardVisual** | **Data** |
| **cardNew** | **Fields** |
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

**Series bucket** is the breakdown/legend field for stacked charts.
**ColumnY / LineY** — combo charts use separate Y buckets, not Y/Y2.
**Details** — scatter chart uses Details (not Category) for the dimension field.

## Field Spec: Two Equivalent Forms

```json
// Shorthand (recommended)
{ "field": "Sales[Net Price]", "type": "measure" }
{ "field": "Date[Year]",       "type": "column" }
{ "field": "financials[Gross Sales]", "type": "aggregation", "aggregation": "Sum" }

// Verbose (also accepted)
{ "entity": "Sales", "property": "Net Price", "type": "measure" }
```

## Aggregation Types
`Sum`, `Avg`, `Count`, `Min`, `Max`, `CountNonNull`, `Median`, `StandardDeviation`, `Variance`

## Container-only visuals (no data binding)
`actionButton`, `pageNavigator`, `shape`, `textbox`, `image` — use without bindings:
```json
{ "visualType": "pageNavigator", "x": 0, "y": 0, "width": 120, "height": 40 }
{ "visualType": "actionButton",  "x": 0, "y": 0, "width": 120, "height": 40 }
```
These automatically get `howCreated: "InsertVisualButton"` in the PBIR JSON.

## Inline Formatting (in add_visual)
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

## Common workflows

### Create a page then populate it
1. `create_page` → get `pageId`
2. `add_visual` (batch mode) with all visuals
3. `set_report_theme` for global colour/font branding
4. Optionally `apply_theme` for per-visual container formatting

### Rearrange visuals
- `move_visual` to reposition/resize one visual
- `auto_layout` to reflow all visuals in a grid

### Clone a visual
- `duplicate_visual` with optional `targetPageId` and `offsetX`/`offsetY`
