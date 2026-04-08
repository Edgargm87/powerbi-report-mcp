# Visual Types Reference

Comprehensive reference for all visual types supported by `powerbi-report-mcp`. Use this to look up exact type strings, data buckets, and known quirks.

---

## 1. Chart Naming Gotchas

Power BI uses non-obvious internal names for its built-in visuals. These cause the most confusion:

| What you want | Correct `visualType` | Common mistake |
|---------------|---------------------|----------------|
| Stacked bar chart | `barChart` | Using `stackedBarChart` (not a valid type -- PBI renders a broken custom visual tile) |
| Stacked column chart | `columnChart` | Using `stackedColumnChart` (not a valid type) |
| Clustered bar chart | `clusteredBarChart` | Using `barChart` (that gives you stacked, not clustered) |
| Clustered column chart | `clusteredColumnChart` | Using `columnChart` (that gives you stacked, not clustered) |

Additional naming traps:

- **There is NO `stackedBarChart` or `stackedColumnChart` type.** The "stacked" variants are just `barChart` and `columnChart`. See [pbir-gotchas.md, section 1.2](pbir-gotchas.md).
- **Combo charts** use `ColumnY` and `LineY` as bucket names -- not `Y` and `Y2`.
- **Scatter charts** use `Details` as the dimension bucket -- not `Category`.
- **Treemap** uses `Group` and `Values` -- not `Category` and `Y`.
- **Matrix** is `pivotTable` -- not `matrix`.
- **Table** is `tableEx` -- not `table`.
- **New card** (`cardNew`) uses a `Fields` bucket internally, which is auto-mapped to the first valid bucket.

---

## 2. Complete Visual Type Reference

### Bar and Column Charts

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `barChart` | Stacked bar | Category, Y, Series, Gradient | This is the stacked variant -- NOT clustered |
| `clusteredBarChart` | Clustered bar | Category, Y, Series, Gradient | |
| `hundredPercentStackedBarChart` | 100% stacked bar | Category, Y, Series | No Gradient bucket |
| `columnChart` | Stacked column | Category, Y, Series, Gradient | This is the stacked variant -- NOT clustered |
| `clusteredColumnChart` | Clustered column | Category, Y, Series, Gradient | |
| `hundredPercentStackedColumnChart` | 100% stacked column | Category, Y, Series | No Gradient bucket |

### Line and Area Charts

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `lineChart` | Line chart | Category, Y, Y2, Series | Y2 is secondary axis |
| `areaChart` | Area chart | Category, Y, Y2, Series | Y2 is secondary axis |
| `stackedAreaChart` | Stacked area | Category, Y, Series | No Y2 bucket |
| `hundredPercentStackedAreaChart` | 100% stacked area | Category, Y, Series | No Y2 bucket |

### Combo Charts

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `lineClusteredColumnComboChart` | Line + clustered column | Category, ColumnY, LineY, Series | Use `ColumnY` and `LineY` -- not Y/Y2 |
| `lineStackedColumnComboChart` | Line + stacked column | Category, ColumnY, LineY, Series | Use `ColumnY` and `LineY` -- not Y/Y2 |

### Pie, Donut, Funnel, and Treemap

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `pieChart` | Pie chart | Category, Y, Series | |
| `donutChart` | Donut chart | Category, Y, Series | |
| `funnelChart` | Funnel chart | Category, Y | No Series bucket |
| `treemap` | Treemap | Group, Values, Details | Uses Group -- not Category |

### Scatter

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `scatterChart` | Scatter chart | Details, X, Y, Size, Series | Uses `Details` -- not Category |

### Maps

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `azureMap` | Azure Map | Category, Size | Simplified bucket set |
| `map` | Bubble map | Category, Size, Series | |
| `filledMap` | Filled map / choropleth | Location, Legend, Values | Different bucket names from other charts |

### Tables and Matrices

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `tableEx` | Table | Values | All columns go into the single Values bucket |
| `pivotTable` | Matrix | Rows, Columns, Values | Internal name is `pivotTable`, not `matrix` |

### Cards and KPIs

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `card` | Card (classic) | Values | Single value display |
| `cardNew` | Card (new) | Fields | `Fields` is auto-mapped to the first valid bucket internally |
| `cardVisual` | Card visual | Data, Rows | Two-bucket card variant |
| `multiRowCard` | Multi-row card | Values | Multiple fields displayed as rows |
| `kpi` | KPI | Indicator, TrendLine, Goal | |
| `gauge` | Gauge | Y, MinValue, MaxValue, TargetValue | |

### Slicers

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `slicer` | Slicer (classic) | Values | Supports `slicerMode`: `Basic` (list) or `Dropdown` |
| `listSlicer` | List slicer | Values | Always-expanded checkbox list; no slicerMode property |
| `textSlicer` | Text slicer | Values | Free-text search box; no slicerMode property |
| `advancedSlicerVisual` | Advanced slicer | Values | Range / between slicer; no slicerMode property |

### Decorative and Navigation

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `textbox` | Text box | (none) | No data binding. Set text via `textContent` param |
| `shape` | Shape | (none) | No data binding. Set shape via `shapeType` param |
| `basicShape` | Basic shape | (none) | Normalised to `shape` internally |
| `image` | Image | (none) | Requires `howCreated: "InsertVisualButton"` |
| `actionButton` | Action button | (none) | Requires `howCreated: "InsertVisualButton"` |
| `pageNavigator` | Page navigator | (none) | Requires `howCreated: "InsertVisualButton"` |

### Other

| `visualType` | Display Name | Data Buckets | Notes |
|-------------|-------------|--------------|-------|
| `ribbonChart` | Ribbon chart | Category, Y, Series | |
| `waterfallChart` | Waterfall chart | Category, Y, Breakdown | Uses `Breakdown` instead of Series |
| `decompositionTreeVisual` | Decomposition tree | Analyze, ExplainBy | AI visual |

---

## 3. Special Visual Handling

### howCreated Requirement

Three visual types require a top-level `howCreated: "InsertVisualButton"` property in the visual container JSON. Without it, Power BI Desktop silently drops them from the canvas -- no error, just invisible.

Affected types: `actionButton`, `pageNavigator`, `image`

These are defined in `INSERT_BUTTON_VISUAL_TYPES` in `src/helpers/createVisual.ts`. The server adds this property automatically when you use `add_visual`.

### Slicer Modes

Only the classic `slicer` type supports the `slicerMode` parameter (`Basic` or `Dropdown`). The mode is written to `objects.data.mode` in the visual JSON.

- `slicer` with `slicerMode: "Basic"` -- expanded list with checkboxes
- `slicer` with `slicerMode: "Dropdown"` -- collapsed dropdown (default); also sets `strictSingleSelect: true`
- `listSlicer`, `textSlicer`, `advancedSlicerVisual` -- mode is inherent to the type; do NOT pass `slicerMode`

All four slicer types share the same `Values` data bucket and the same sort definition behavior.

### Shape Types

When `visualType` is `shape`, use the `shapeType` parameter to select the shape:

| `shapeType` | Description |
|-------------|-------------|
| `rectangle` | Rectangle (default) |
| `rectangleRounded` | Rounded rectangle |
| `line` | Horizontal/vertical line |
| `tabCutCorner` | Tab with cut corner |
| `tabCutTopCorners` | Tab with cut top corners |
| `tabRoundCorner` | Tab with round corner |
| `tabRoundTopCorners` | Tab with round top corners |

Additional shape parameters: `fillColor` (hex, default `#D9D9D9`), `shapeRotation` (degrees, default 0), `textContent`, `textColor`, `textAlign`, `textSize`, `textBold`.

Note: `basicShape` is normalised to `shape` internally.

### No-Data Visuals

These visual types have no data binding and receive no default font formatting on axes/legend/labels:

`textbox`, `shape`, `basicShape`, `image`, `actionButton`, `pageNavigator`

Defined in `NO_DATA_VISUAL_TYPES` in `src/helpers/createVisual.ts`.

---

## 4. Bucket Quick Reference

Single lookup table for every supported visual type.

| `visualType` | Bucket 1 | Bucket 2 | Bucket 3 | Bucket 4 | Bucket 5 |
|-------------|----------|----------|----------|----------|----------|
| `barChart` | Category | Y | Series | Gradient | |
| `clusteredBarChart` | Category | Y | Series | Gradient | |
| `hundredPercentStackedBarChart` | Category | Y | Series | | |
| `columnChart` | Category | Y | Series | Gradient | |
| `clusteredColumnChart` | Category | Y | Series | Gradient | |
| `hundredPercentStackedColumnChart` | Category | Y | Series | | |
| `lineChart` | Category | Y | Y2 | Series | |
| `areaChart` | Category | Y | Y2 | Series | |
| `stackedAreaChart` | Category | Y | Series | | |
| `hundredPercentStackedAreaChart` | Category | Y | Series | | |
| `lineClusteredColumnComboChart` | Category | ColumnY | LineY | Series | |
| `lineStackedColumnComboChart` | Category | ColumnY | LineY | Series | |
| `ribbonChart` | Category | Y | Series | | |
| `waterfallChart` | Category | Y | Breakdown | | |
| `scatterChart` | Details | X | Y | Size | Series |
| `pieChart` | Category | Y | Series | | |
| `donutChart` | Category | Y | Series | | |
| `funnelChart` | Category | Y | | | |
| `treemap` | Group | Values | Details | | |
| `azureMap` | Category | Size | | | |
| `map` | Category | Size | Series | | |
| `filledMap` | Location | Legend | Values | | |
| `pivotTable` | Rows | Columns | Values | | |
| `tableEx` | Values | | | | |
| `card` | Values | | | | |
| `cardNew` | Fields | | | | |
| `cardVisual` | Data | Rows | | | |
| `multiRowCard` | Values | | | | |
| `kpi` | Indicator | TrendLine | Goal | | |
| `gauge` | Y | MinValue | MaxValue | TargetValue | |
| `decompositionTreeVisual` | Analyze | ExplainBy | | | |
| `slicer` | Values | | | | |
| `listSlicer` | Values | | | | |
| `textSlicer` | Values | | | | |
| `advancedSlicerVisual` | Values | | | | |
| `textbox` | (none) | | | | |
| `shape` | (none) | | | | |
| `image` | (none) | | | | |
| `actionButton` | (none) | | | | |
| `pageNavigator` | (none) | | | | |

---

## 5. The Series Bucket

The `Series` bucket controls how data is split into multiple visual elements (segments, lines, or slices). Its behavior depends on the chart type:

### Stacked charts (barChart, columnChart, stackedAreaChart, etc.)

Series defines the **stack segments**. Each unique value in the Series field becomes a colored segment within each bar/column/area.

Example: Revenue by Region (Category) stacked by Product Category (Series) -- each bar shows Region on the axis, with colored segments for each Product Category.

### Line and area charts (lineChart, areaChart)

Series creates **multiple lines or areas**. Each unique value in the Series field becomes a separate line/area on the chart.

### Pie and donut charts

Series creates **multiple pie/donut rings** (small multiples behavior). Usually you want Category for slices and Y for values, without Series.

### When to use Series vs. multiple Y fields

- **Series bucket**: Use when you have one measure and want to split it by a categorical dimension (e.g., Revenue split by Region).
- **Multiple fields in Y bucket**: Use when you have multiple different measures to compare (e.g., Revenue and Profit on the same axis).

### Example binding with Series

```json
{
  "visualType": "barChart",
  "bindings": [
    {
      "bucket": "Category",
      "fields": [{ "field": "Sales[Region]", "type": "column" }]
    },
    {
      "bucket": "Y",
      "fields": [{ "field": "Sales[Revenue]", "type": "aggregation", "aggregation": "Sum" }]
    },
    {
      "bucket": "Series",
      "fields": [{ "field": "Products[Category]", "type": "column" }]
    }
  ]
}
```

This produces a stacked bar chart where each bar represents a Region, and the colored segments within each bar represent Product Categories, with the bar length showing Sum of Revenue.
