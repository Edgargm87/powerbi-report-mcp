<!-- mirrored from skills/formatting.md at v0.9.6 (08eda17) -->

<!-- doc-version: 2.1 | Last updated: 2026-04-15 -->
<!-- summary: Chrome/content/polish split, pbir_format_visual auto-routing, inline containerFormat/visualFormat, conditional format rules & gradients, measure-driven titles/axes/colors, pbir_apply_theme presets. -->
# Skill: Formatting — Visual Styling, Titles, Colors, Conditional Format, Sort

## Three bands: chrome / content / polish

Before reaching for any formatting tool, decide which band the work falls in.

| Band | Who owns it | What belongs here | MCP action |
|---|---|---|---|
| **Chrome** | Theme — one `pbir_set_report_theme` call | Typography, default colors, chart defaults, table styles, background, borders, tooltips | Agent sets once per report. Cascades to every visual automatically. Changing the theme later updates everything. |
| **Content & semantics** | Agent — inline in `pbir_add_visual` | `title`, `bindings`, `dataColors` *only when they encode meaning* (gains=green, losses=red), shape `fillColor`/`textContent`, conditional formatting *rules* | Agent bakes in at creation time — the visual is wrong without it. |
| **Polish** | Developer in PBI Desktop | Per-visual drop-shadows, border radii, padding tweaks, axis tick counts, label rotation, font overrides, visual-type-specific cosmetic properties | Agent does NOT do this. These require aesthetic judgment, produce inconsistent results across runs, and write override blocks that fight future theme changes. |

**Why this split matters.** Inline formatting (`containerFormat`, `visualFormat`) writes override property blocks into the PBIR that the theme can't reach through. When the developer later changes the theme, those overrides silently win — requiring a manual cleanup pass to remove them before the theme takes effect. The right default is: **theme handles chrome, agent handles content, developer handles polish.**

### Precedence — what wins when two sources set the same property

1. **Inline visual formatting** (`visualFormat` / `containerFormat` on `pbir_add_visual`, `pbir_format_visual`) — highest
2. `visualStyles.<visualType>.<category>[0]` in the custom theme
3. `visualStyles.*.*` (theme-wide wildcard)
4. PBI built-in defaults — lowest

If a theme change "doesn't seem to take effect," run `pbir_audit_theme_compliance` — it flags visuals whose inline overrides are masking theme values. Then decide: accept the override (keep it), or clear it (re-run `pbir_set_report_theme` after stripping the override block).

### Discovering valid property names

`pbir_format_visual` does not pre-validate property names — PBI Desktop silently ignores unknown property keys at render time. Call `pbir_lookup_theme_property({ visualType, category })` *before* writing to confirm the exact names for the target visual type (e.g. slicer uses `textSize`, not `fontSize`; waterfall uses `sentimentColors`, not `dataPoint`).

### Decision rule

1. Is it a `title`, `binding`, or semantic color? → **Inline in `pbir_add_visual`.**
2. Is it a shape, text box, or button? → **Inline** (these *are* their formatting).
3. Is it a conditional format rule? → **`pbir_set_conditional_format`** (this is logic, not decoration).
4. Is it global brand (fonts, palette, chart defaults)? → **`pbir_set_report_theme`** once.
5. Everything else? → **Leave it for the developer.** Don't call `pbir_format_visual` or pass `containerFormat`/`visualFormat` unless the user explicitly asked for a specific look.

The tools below exist for cases where the user explicitly requests formatting. Use them when asked — but the default action is to leave visuals theme-defaulted.

---

## When to use
Use these patterns to style visuals — backgrounds, borders, titles, axes, legend, data colors, conditional formatting, sort order, and apply preset themes to a whole page.

## Tool surface

| Tool | Purpose |
|---|---|
| `pbir_format_visual` | Apply formatting to one visual. Auto-routes container vs visual categories. |
| `pbir_set_visual_title` | Quick-set title text/show/font/size/alignment without touching other formatting |
| `pbir_set_datapoint_colors` | Override series or category colors |
| `pbir_set_conditional_format` | Rules-based or gradient conditional background/title color |
| `pbir_set_visual_sort` | Override the auto-sort with explicit sort fields and directions |
| `pbir_apply_theme` | Apply a preset theme (`dark`/`light`/`corporate`/`blue-purple`) to all visuals on a page |
| `pbir_bulk_update_format` | Same formatting payload across many visuals — see `skills/visuals.md` |

For batch reformat across many visuals see `pbir_bulk_update_format`. For inline formatting at creation time see `pbir_add_visual` in `skills/visuals.md`.

## The two formatting layers

PBIR splits per-visual formatting into two trees:

| Tree | What it holds | Example categories |
|---|---|---|
| `visualContainerObjects` | The container chrome (the box around the visual) | `title`, `subTitle`, `background`, `border`, `padding`, `dropShadow`, `visualHeader`, `visualHeaderTooltip` |
| `objects` | The visual's internal rendering | `categoryAxis`, `valueAxis`, `legend`, `labels`, `dataPoint`, `lineStyles`, `items`, `header`, `values` |

`pbir_format_visual` routes between them automatically based on the category name — you don't need to know which tree a category lives in.

## `pbir_format_visual` — auto-routing (default)

```json
{
  "pageId": "<id>",
  "visualId": "<id>",
  "formatting": [
    { "category": "background",   "properties": { "show": true, "color": "#FFFFFF", "transparency": 0 } },
    { "category": "border",       "properties": { "show": true, "color": "#E0E0E0", "radius": 8 } },
    { "category": "categoryAxis", "properties": { "show": true, "fontSize": 9 } },
    { "category": "legend",       "properties": { "show": true, "position": "Bottom", "fontSize": 9 } }
  ]
}
```

`background` and `border` route to `visualContainerObjects`; `categoryAxis` and `legend` route to `objects`. One call, both trees written.

### CONTAINER_CATEGORIES — the auto-routing set

These category names always route to `visualContainerObjects`. Everything else goes to `objects`.

```
title, subTitle, background, border, padding,
dropShadow, visualHeader, visualHeaderTooltip
```

### Forcing a target

Pass `target: "container"` or `target: "visual"` to skip auto-routing — useful when you want to set a non-standard category against a specific tree.

```json
{ "pageId": "<id>", "visualId": "<id>", "target": "container",
  "formatting": [{ "category": "background", "properties": { "show": true, "color": "#F0F4FF" } }] }
```

## Inline formatting at create time

`pbir_add_visual` accepts `containerFormat`, `visualFormat`, and `dataColors` so you can style a visual in the same call that creates it. **Always prefer this** over a separate `pbir_format_visual` round-trip.

```json
{
  "visualType": "columnChart",
  "x": 20, "y": 80, "width": 560, "height": 300,
  "title": "Revenue by Region",
  "containerFormat": [
    { "category": "background",   "properties": { "show": true, "color": "#FFFFFF", "transparency": 0 } },
    { "category": "border",       "properties": { "show": true, "color": "#E0E0E0", "radius": 8 } },
    { "category": "visualHeader", "properties": { "show": false } }
  ],
  "visualFormat": [
    { "category": "categoryAxis", "properties": { "fontSize": 9 } },
    { "category": "valueAxis",    "properties": { "fontSize": 9 } },
    { "category": "labels",       "properties": { "show": true, "fontSize": 8 } }
  ],
  "dataColors": [
    { "color": "#4A90D9" }, { "color": "#50B748" }, { "color": "#F5A623" }
  ]
}
```

`containerFormat` writes to `visualContainerObjects`; `visualFormat` writes to `objects`; `dataColors` is a shortcut for the first dataPoint series colors.

## Property encoding (handled for you)

The `buildFormattingProps` helper auto-encodes raw JS values to PBIR literal expressions — you never write the wrapping yourself.

| You pass | PBIR encoding |
|---|---|
| `"#FF0000"` | `{ solid: { color: { expr: { Literal: { Value: "'#FF0000'" } } } } }` |
| `true` / `false` | `{ expr: { Literal: { Value: "true" } } }` |
| `8` (number) | `{ expr: { Literal: { Value: "8D" } } }` |
| `"Bottom"` (string) | `{ expr: { Literal: { Value: "'Bottom'" } } }` |

Numbers always get a `D` suffix (PBIR doubles). Strings and hex colors get wrapped in single quotes.

## Common container categories

| category | Key properties |
|---|---|
| `background` | `show`, `color`, `transparency` |
| `border` | `show`, `color`, `radius` |
| `title` | `show`, `text`, `fontSize`, `fontFamily`, `alignment`, `titleWrap` |
| `subTitle` | `show`, `text`, `fontSize`, `fontColor` |
| `padding` | `top`, `bottom`, `left`, `right` |
| `dropShadow` | `show`, `position` (`"Outer"` / `"Inner"`) |
| `visualHeader` | `show` |
| `visualHeaderTooltip` | `show`, `text` |

## Common visual categories

| category | Key properties |
|---|---|
| `categoryAxis` | `show`, `fontSize`, `fontFamily`, `gridlines` |
| `valueAxis` | `show`, `fontSize`, `start`, `end`, `gridlines` |
| `legend` | `show`, `position` (`Top`/`Bottom`/`Left`/`Right`), `fontSize` |
| `labels` | `show`, `fontSize`, `color` |
| `lineStyles` | `strokeWidth`, `lineStyle` |
| `dataPoint` | Use `pbir_set_datapoint_colors` or `dataColors` array — manual edits get tricky |
| `items` | `fontSize`, `fontFamily` (slicers) |
| `header` | `fontSize`, `fontFamily` (slicers) |
| `values` | Used for conditional gradient — set via `pbir_set_conditional_format` |

## `pbir_set_visual_title`

Quick-set the title without touching anything else:

```json
{
  "pageId": "<id>", "visualId": "<id>",
  "title": "Revenue by Region",
  "show": true,
  "fontSize": 11,
  "fontFamily": "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif",
  "alignment": "left",
  "titleWrap": false
}
```

Merges into the existing `title` properties — only the fields you pass are overwritten.

## `pbir_set_datapoint_colors`

Two modes depending on whether the chart has a Series bucket:

### Series-based (default — metadata mode)
Use for charts with a `Series` bucket — bar/column with breakdown, line with multiple series, etc.

```json
{
  "pageId": "<id>", "visualId": "<id>",
  "colors": [
    { "color": "#CD191C", "seriesName": "Actual" },
    { "color": "#4A90D9", "seriesName": "Budget" }
  ],
  "defaultTransparency": 0
}
```

### Category-based (data selector mode)
**Required** for charts whose colored items are category values, not series names — `barChart`/`columnChart`/`pieChart`/`donutChart`/`treemap` with a single measure. Pass `categoryEntity` and `categoryProperty` to point at the category column:

```json
{
  "pageId": "<id>", "visualId": "<id>",
  "categoryEntity": "Store",
  "categoryProperty": "Region",
  "colors": [
    { "color": "#4A90D9", "seriesName": "North" },
    { "color": "#50B748", "seriesName": "South" },
    { "color": "#F5A623", "seriesName": "East" },
    { "color": "#CD191C", "seriesName": "West" }
  ]
}
```

Without `categoryEntity`/`categoryProperty`, the colors land in metadata mode and PBI ignores them on category-based charts.

## `pbir_set_conditional_format`

Apply rules-based or gradient conditional formatting to a visual's container background or title font color.

### Rules mode — discrete value → color

```json
{
  "pageId": "<id>", "visualId": "<id>",
  "property": "background",
  "formatType": "rules",
  "entity": "Sales",
  "property2": "KPI Status",
  "isMeasure": true,
  "rules": [
    { "comparisonKind": 0, "value": "Good",    "color": "#00B050" },
    { "comparisonKind": 0, "value": "Warning", "color": "#FFC000" },
    { "comparisonKind": 0, "value": "Bad",     "color": "#C00000" }
  ],
  "defaultColor": "#FFFFFF"
}
```

`comparisonKind`: `0`=Equal, `1`=GT, `2`=GTE, `3`=LT, `4`=LTE, `5`=NotEqual.

`property`: `"background"` (sets container background `color`) or `"title"` (sets title `fontColor`).

`isMeasure`: `true` for DAX measure, `false` for column (auto-wrapped in `Aggregation Sum` so table/matrix projection stays valid).

Rules write to `visualContainerObjects[property]` as a `Conditional.Cases` expression — first match wins, falls back to `defaultColor`.

### Gradient mode — continuous value → color scale

```json
{
  "pageId": "<id>", "visualId": "<id>",
  "property": "background",
  "formatType": "gradient",
  "entity": "Sales",
  "property2": "Margin %",
  "isMeasure": true,
  "minColor": "#C00000",
  "midColor": "#FFC000",
  "maxColor": "#00B050"
}
```

Two-point gradient: omit `midColor`. Three-point: include it. Writes a `FillRule.linearGradient2`/`linearGradient3` into `objects.values` with a `dataViewWildcard` selector — PBI then colors each row of the table/matrix by its value of the driving field.

### Clear

```json
{ "pageId": "<id>", "visualId": "<id>", "property": "background", "formatType": "clear" }
```

Removes the conditional definition from `visualContainerObjects`.

## `pbir_set_visual_sort`

Override the auto-sort with explicit sort fields and directions. Field uses `Table[Column]` shorthand.

```json
{
  "pageId": "<id>", "visualId": "<id>",
  "sort": [
    { "field": "Sales[Total Revenue]", "type": "measure",     "direction": "Descending" },
    { "field": "Date[Year]",           "type": "column",      "direction": "Ascending"  }
  ],
  "isDefaultSort": false
}
```

`type`: `column` | `measure` | `aggregation`. For `aggregation`, also pass `aggregation`: `Sum`/`Avg`/`Count`/`Min`/`Max`/`CountNonNull`/`Median`/`StandardDeviation`/`Variance`.

`direction`: `Ascending` | `Descending` (default Descending).

`isDefaultSort: true` lets the user re-sort interactively in the report; `false` (default) locks it.

The visual must already have a `query` (it must have data bindings) — sort can't be set on container-only visuals like shapes or buttons.

When `type: "measure"` and the specified entity does not own the measure but exactly one other table does (and a sibling `.SemanticModel` is present), the entity is auto-corrected to the home table — the same behaviour `pbir_add_visual` and `pbir_update_visual_bindings` apply. The response surfaces a `bindingAutoCorrections` array when this fires.

## `pbir_apply_theme`

Apply a named preset theme to every data visual on a page in one call.

```json
{ "pageId": "<id>", "theme": "corporate", "applyDataColors": true }
```

Available presets: `dark`, `light`, `corporate`, `blue-purple`.

- Skips `textbox`, `shape`, `image`, `actionButton`, `pageNavigator` (they have their own styling)
- Slicers use a separate `slicerContainerFormat` if the preset defines one
- `applyDataColors: true` (default) repaints chart datapoint colors with the preset palette
- For full report-level theming use `pbir_set_report_theme` — see `skills/themes.md`

## Default fonts applied automatically

`createAndSaveVisual` sets these on every visual at creation time:

- Title: `fontSize: 8`, Segoe UI
- Chart axes / legend / labels: `fontSize: 8`, Segoe UI
- Slicer items / header: `fontSize: 8`, Segoe UI

Override via `containerFormat` / `visualFormat` in the same `pbir_add_visual` call, or with `pbir_format_visual` afterwards.

## Measure-driven formatting (dynamic properties)

Most formatting properties accept **measure expressions** in addition to literal values. That's how you get titles, axis bounds, colors, and reference-line thresholds that react to the data — without touching conditional-formatting rules.

Shape of a measure-driven value:
```json
{ "expr": { "Measure": { "Expression": { "SourceRef": { "Entity": "_measures" } }, "Property": "My Title" } } }
```
Wrap it wherever the property would normally take a literal.

### Dynamic titles & subtitles
Put a measure returning text into `title.text` (or `subTitle.text`) instead of a string:
```json
"title": [{ "text": { "expr": { "Measure": { "Expression": { "SourceRef": { "Entity": "_measures" } }, "Property": "Dynamic Title" } } } }]
```
The measure can concatenate filter context, period names, etc.

### Dynamic axis bounds
`valueAxis.start`, `valueAxis.end`, `valueAxis.secStart`, `valueAxis.secEnd` all accept measure expressions. Pattern:
```json
"valueAxis": [{
  "start": { "expr": { "Measure": { ... "Property": "Axis Min" } } },
  "end":   { "expr": { "Measure": { ... "Property": "Axis Max" } } }
}]
```
Unlocks "always scaled to 120% of max" and similar data-aware zoom patterns. Set `secShow: true` to enable the secondary axis (`y2Axis`).

### Measure-driven data colors
Single-measure color field — simpler than a `fillRule`:
```json
"dataPoint": [{ "fill": { "solid": { "color": { "expr": { "Measure": { ... "Property": "Bar Color" } } } } } }]
```
The measure must return a hex string (e.g. `"#22C55E"`). For multi-stop gradients or thresholds, use `pbir_set_conditional_format` (which writes a `FillRule`).

### Error-bar measure bounds — bullet, lollipop, progress, band
`error.errorRange` drives bullet charts, progress bars, threshold bands, and similar composite shapes:
```json
"error": [{
  "enabled": true,
  "errorRange": {
    "kind": "ErrorRange",
    "explicit": {
      "isRelative": false,
      "lowerBound": { "expr": { "Measure": { ... "Property": "Target Min" } } },
      "upperBound": { "expr": { "Measure": { ... "Property": "Target Max" } } }
    }
  },
  "shadeColor": { "solid": { "color": "#F3F4F6" } },
  "shadeTransparency": 50
}]
```
Available on `barChart`, `columnChart`, `lineChart`, `clusteredBarChart`. The reference data-goblin examples (`barChart-bullet`, `barChart-lollipop`, `barChart-progress`, `lineChart-thresholds`) all use this mechanism — there is no separate "bullet chart" visual type.

### Axis reference lines
Distinct objects per axis: `y1AxisReferenceLine`, `xAxisReferenceLine` on `lineChart`/`scatterChart`, plus `referenceLine` on some others. Value is typically a measure:
```json
"y1AxisReferenceLine": [{
  "show": true,
  "value": { "expr": { "Measure": { ... "Property": "Target" } } },
  "lineColor": { "solid": { "color": "#EF4444" } },
  "style": "dashed",
  "dataLabelShow": true,
  "dataLabelText": "Target",
  "dataLabelHorizontalPosition": "right",
  "transparency": 0
}]
```
This is the preferred way to draw threshold lines — don't fake them with error bars or shapes.

## Common workflows

### Polish a freshly-created visual
1. `pbir_add_visual` with inline `title`, `containerFormat`, `visualFormat`, `dataColors` — done in one call
2. Only fall back to `pbir_format_visual` if you decide later to tweak

### Apply consistent styling across the page
- `pbir_apply_theme` for one of the four presets
- `pbir_set_report_theme` for a full custom theme (see `skills/themes.md`)
- `pbir_bulk_update_format` to push the same `containerFormat` payload onto a list of visual IDs (see `skills/visuals.md`)

### Color-code a KPI card by its status measure
- `pbir_set_conditional_format` with `formatType: "rules"`, `property: "background"`, three rules on a `KPI Status` measure → green/amber/red

### Highlight a table row by margin
- `pbir_set_conditional_format` with `formatType: "gradient"`, `property: "background"` and `entity`/`property2` pointing to your margin measure
