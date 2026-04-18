<!-- doc-version: 1.0 | Last updated: 2026-04-09 -->
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
- **Combo charts** use `Y` (column series) and `Y2` (line series) as bucket names -- the same naming as `lineChart`. (Earlier revisions of this doc said `ColumnY`/`LineY` -- that was wrong against the Fabric 2.7.0 schema.)
- **Scatter charts** use `Category` as the dimension bucket (verified against schema + Desktop output). Earlier revisions said `Details` -- that was wrong.
- **Advanced slicer** (`advancedSlicerVisual`) uses `Rows`, not `Values`.
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
| `lineClusteredColumnComboChart` | Line + clustered column | Category, Y, Y2, Series | `Y` = column series, `Y2` = line series |
| `lineStackedColumnComboChart` | Line + stacked column | Category, Y, Y2, Series | `Y` = column series, `Y2` = line series |

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
| `scatterChart` | Scatter chart | Category, X, Y, Size, Series | Dimension bucket is `Category` (verified against Fabric schema 2.7.0) |

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
| `advancedSlicerVisual` | Advanced slicer | Rows | Range / between slicer; dimension bucket is `Rows` (not Values); no slicerMode property |

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
| `lineClusteredColumnComboChart` | Category | Y | Y2 | Series | |
| `lineStackedColumnComboChart` | Category | Y | Y2 | Series | |
| `ribbonChart` | Category | Y | Series | | |
| `waterfallChart` | Category | Y | Breakdown | | |
| `scatterChart` | Category | X | Y | Size | Series |
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
| `advancedSlicerVisual` | Rows | | | | |
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

---

## 6. Formatting Reference

The `format_visual` tool is pass-through: any category/property combination you specify is written directly into the visual's formatting objects. This means any valid Power BI formatting category and property works -- but using the **wrong name fails silently**. Power BI does not error on unrecognized properties; it simply ignores them. Your formatting looks like it applied, but nothing changes on the canvas.

This section documents the correct names so you do not have to guess.

---

### Cross-Cutting Gotchas

These are the most dangerous naming inconsistencies across visual types. Getting any of these wrong results in silent failure.

| Gotcha | Detail |
|--------|--------|
| `textSize` vs `fontSize` | Classic slicer uses `textSize` in `items` and `header`. Everything else uses `fontSize`. Exception: stackedAreaChart's `seriesLabels` also uses `textSize`. |
| `color` vs `fontColor` vs `labelColor` | Legacy card/multiRowCard use `color`. New cardVisual uses `fontColor`. Axis containers use `labelColor`. |
| `backColor` vs `backgroundColor` | tableEx/pivotTable use `backColor`. Scorecard uses `backgroundColor`. |
| No `dataPoint` on waterfall | Use `sentimentColors` with increaseFill, decreaseFill, totalFill, otherFill. |
| No `labels` on scatter | Use `categoryLabels` instead. |
| Combo chart dual axis | Secondary axis properties use `sec` prefix within `valueAxis` (secShow, secFontSize, secLabelColor). |
| Theme key `pivotTable` not `matrix` | The matrix visual's internal type name is `pivotTable`. |
| KPI `trendline` not `trendLine` | Lowercase L. |
| Pie/donut label position | PascalCase required: `Outside`, `Inside`, `BestFit`. Lowercase silently ignored. |
| Gauge `calloutValue` | Has NO `fontSize` property. Central number font size is not controllable via formatting. |
| Action button states | State keys: `*` (default), `hover`, `press`, `selected`, `disabled`. Omitted states inherit from `*`. |
| Color objects | All color properties require `{"solid":{"color":"#hex"}}` format. format_visual handles this automatically -- pass plain `#hex` strings. |

---

### Container Names by Visual Type

Formatting containers are the `category` values you pass to `format_visual`. Each visual type supports a specific set of containers. Using a container name that does not belong to a visual type fails silently.

#### Bar / Column family

**Applies to:** `barChart`, `clusteredBarChart`, `columnChart`, `clusteredColumnChart`, `hundredPercentStackedBarChart`, `hundredPercentStackedColumnChart`, `ribbonChart`

| Container | Notes |
|-----------|-------|
| `categoryAxis` | In bar charts (horizontal), this is the **Y-axis**. In column charts (vertical), this is the **X-axis**. |
| `valueAxis` | In bar charts (horizontal), this is the **X-axis**. In column charts (vertical), this is the **Y-axis**. |
| `legend` | |
| `labels` | Data labels on each bar/column segment. |
| `dataPoint` | Fill colors for series. |
| `totals` | Stacked types only (`barChart`, `columnChart`, `hundredPercentStackedBarChart`, `hundredPercentStackedColumnChart`). |
| `ribbonBands` | `ribbonChart` only. |

#### Line / Area family

**Applies to:** `lineChart`, `areaChart`, `stackedAreaChart`, `hundredPercentStackedAreaChart`

| Container | Notes |
|-----------|-------|
| `categoryAxis` | |
| `valueAxis` | |
| `legend` | |
| `labels` | |
| `lineStyles` | strokeWidth, lineStyle (solid, dashed, dotted). |
| `markers` | markerShape, markerSize. |
| `seriesLabels` | Stacked types only. Uses `textSize` **NOT** `fontSize`. |
| `totals` | Stacked types only. |

#### Combo charts

**Applies to:** `lineClusteredColumnComboChart`, `lineStackedColumnComboChart`

| Container | Notes |
|-----------|-------|
| `categoryAxis` | |
| `valueAxis` | Dual axis: secondary axis properties use `sec` prefix (secShow, secFontSize, secLabelColor). |
| `legend` | |
| `labels` | |
| `lineStyles` | |
| `markers` | |
| `totals` | `lineStackedColumnComboChart` only. |

#### Pie / Donut

**Applies to:** `pieChart`, `donutChart`

| Container | Notes |
|-----------|-------|
| `labels` | `position`: `Outside`, `Inside`, `BestFit` -- **PascalCase required**. `labelStyle`: `Category`, `Data`, `Percent of total`. |
| `legend` | |
| `dataPoint` | |
| `slices` | `donutChart` only. `innerRadiusRatio` controls hole size. |

#### Scatter

**Applies to:** `scatterChart`

| Container | Notes |
|-----------|-------|
| `categoryAxis` | |
| `valueAxis` | |
| `legend` | |
| `categoryLabels` | **NOT** `labels`. Using `labels` fails silently. |
| `markers` | |
| `dataPoint` | |

#### Waterfall

**Applies to:** `waterfallChart`

| Container | Notes |
|-----------|-------|
| `categoryAxis` | |
| `valueAxis` | |
| `legend` | |
| `labels` | |
| `sentimentColors` | **NOT** `dataPoint`. Properties: `increaseFill`, `decreaseFill`, `totalFill`, `otherFill`. |

#### Funnel

**Applies to:** `funnel`

| Container | Notes |
|-----------|-------|
| `labels` | `funnelLabelStyle` controls label format. |
| `categoryAxis` | |
| `percentBarLabel` | |
| `dataPoint` | |

#### Gauge

**Applies to:** `gauge`

| Container | Notes |
|-----------|-------|
| `calloutValue` | **NO `fontSize` property.** Central number font size is not controllable via formatting. |
| `labels` | |
| `dataPoint` | `fill` = arc color, `target` = target line color. |

#### Treemap

**Applies to:** `treemap`

| Container | Notes |
|-----------|-------|
| `legend` | |
| `labels` | |
| `dataPoint` | Supports `fillRule` for gradient coloring. |

#### KPI

**Applies to:** `kpi`

| Container | Notes |
|-----------|-------|
| `indicator` | |
| `trendline` | **Lowercase L** -- not `trendLine`. |
| `goals` | |
| `status` | Properties: `goodColor`, `neutralColor`, `badColor`. |

#### Cards

**`card` (legacy)**

| Container | Notes |
|-----------|-------|
| `labels` | Uses `color` -- not `fontColor`. |
| `categoryLabels` | |

**`cardVisual` (new)**

| Container | Notes |
|-----------|-------|
| `value` | Uses `fontColor` -- not `color`. |
| `label` | |
| `cardCalloutArea` | |

**`multiRowCard`**

| Container | Notes |
|-----------|-------|
| `cardTitle` | |
| `dataLabels` | Uses `color` -- not `fontColor`. |
| `card` | `barShow` and other card-level properties. |

#### Slicers

**`slicer` (classic)**

| Container | Notes |
|-----------|-------|
| `items` | Uses `textSize` -- **NOT** `fontSize`. |
| `header` | Uses `textSize` -- **NOT** `fontSize`. |
| `searchBox` | |
| `selection` | |
| `data` | |
| `slider` | |

**`advancedSlicerVisual` / `listSlicer`**

| Container | Notes |
|-----------|-------|
| `label` | |
| `value` | |
| `layout` | |
| `selection` | |
| `selectionIcon` | |
| `accentBar` | |
| `outline` | Uses `fontSize` (standard). |

#### Tables

**`tableEx`**

| Container | Notes |
|-----------|-------|
| `columnHeaders` | Uses `backColor` / `fontColor`. |
| `values` | Uses `backColor` / `fontColor`. |
| `total` | |
| `grid` | |

**`pivotTable`**

| Container | Notes |
|-----------|-------|
| `columnHeaders` | Uses `backColor` / `fontColor`. |
| `rowHeaders` | |
| `values` | Uses `backColor` / `fontColor`. |
| `total` | |
| `grid` | |

**`scorecard`**

| Container | Notes |
|-----------|-------|
| `header` | Uses `backgroundColor` / `foregroundColor`. |
| `columnHeaders` | |
| `scorecard` | |
| `goals` | |

#### Shapes / Text / Buttons

**`shape`**

| Container | Notes |
|-----------|-------|
| `shape` | |
| `fill` | |
| `outline` | |
| `rotation` | |

**`textbox`**

| Container | Notes |
|-----------|-------|
| `text` | Uses color object for `text.color`. |

**`actionButton`**

| Container | Notes |
|-----------|-------|
| `fill` | Supports state keys: `*` (default), `hover`, `press`, `selected`, `disabled`. |
| `text` | Supports state keys. |
| `outline` | Supports state keys. |
| `shape` | |
| `icon` | |

**`image`**

| Container | Notes |
|-----------|-------|
| `image` | Properties: `fit`, `transparency`, `cornerRadius`. |

---

### Common Formatting Recipes

Quick copy-paste recipes showing the correct `category` and `properties` for common formatting tasks.

**Hide axis labels:**

```json
{ "category": "categoryAxis", "properties": { "show": false } }
```

**Style legend:**

```json
{ "category": "legend", "properties": { "show": true, "position": "Top", "fontSize": 10, "fontFamily": "Segoe UI" } }
```

**Data labels on bar chart:**

```json
{ "category": "labels", "properties": { "show": true, "fontSize": 9, "color": "#333333", "labelDisplayUnits": 1000 } }
```

**Slicer item styling** (note: `textSize` not `fontSize`):

```json
{ "category": "items", "properties": { "textSize": 10, "fontColor": "#333333" } }
```

**Table header styling:**

```json
{ "category": "columnHeaders", "properties": { "fontSize": 11, "fontFamily": "Segoe UI Semibold", "fontColor": "#FFFFFF", "backColor": "#1B2A4A" } }
```

**Waterfall colors:**

```json
{ "category": "sentimentColors", "properties": { "increaseFill": "#107C10", "decreaseFill": "#D83B01", "totalFill": "#0078D4" } }
```
