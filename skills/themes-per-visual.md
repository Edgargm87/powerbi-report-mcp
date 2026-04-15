<!-- doc-version: 1.0 | Last updated: 2026-04-15 -->
# Skill: Per-Visual Theme Overrides

## When to use

Read this when you need to theme a **specific visual type** differently from the rest of the report — e.g. "make all `tableEx` visuals use 11pt Segoe UI with alternating row backgrounds" or "all `kpi` visuals should use the brand-green trend color".

The general `set_report_theme` skill lives in `skills/themes.md`. This file zooms in on the `visualStyles` block inside a theme — the structure Power BI uses for per-type property overrides. Nothing here is proprietary: the schema is documented by Microsoft at [learn.microsoft.com/power-bi/create-reports/desktop-report-themes](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes). This file just collects the most common property categories in one place so an agent doesn't have to guess.

## Mental model

A Power BI theme JSON has two tiers:

1. **Report-wide defaults** — `dataColors`, `background`, `foreground`, `tableAccent`, etc. Apply to everything unless overridden.
2. **Per-visual overrides** — `visualStyles[visualType][propertyCategory]` arrays. Apply only to visuals of that type.

```json
{
  "name": "Brand v2",
  "dataColors": ["#0078D4", "#00BCF2", "#FFB900"],
  "background": "#FFFFFF",
  "foreground": "#1A1A1A",
  "visualStyles": {
    "*":              { "*": { /* applies to every visual, every category */ } },
    "tableEx":        { "*": { /* applies to every tableEx category */ } },
    "columnChart":    { "dataLabels": [{ "show": true, "fontSize": 9 }] },
    "kpi":            { "trendAxis":  [{ "lineColor": { "solid": { "color": "#22C55E" } } }] }
  }
}
```

**Keys:**

- Outer key `*` = wildcard visual type. Use it for rules that apply to every visual (e.g. title font).
- Inner key `*` = wildcard category. Use it when you want a rule to apply to every category inside that visual type.
- Named visual types match the `visualType` IDs used by `add_visual` (see `skills/visuals.md` Visual Type Reference).
- Each category value is an **array** of property objects, not a single object. Power BI supports multiple rule variants (default, when-condition, etc.) per category — even if you only need one, the array wrapper is required.

## Property shapes

Theme JSON uses a specific verbose form for colors and fonts that is **different** from the inline `format_visual` shorthand this MCP accepts. The theme writer passes the object through unchanged, so you need to use Microsoft's shapes:

| Concept | Inline `format_visual` shorthand | Theme JSON shape |
|---|---|---|
| Solid color | `"color": "#3B82F6"` | `"color": { "solid": { "color": "#3B82F6" } }` |
| Font size | `"fontSize": 9` | `"fontSize": 9` (same — numeric scalar) |
| Font family | `"fontFamily": "Segoe UI"` | `"fontFamily": "Segoe UI"` (same) |
| Show/hide | `"show": true` | `"show": true` (same) |
| Boolean as theme value | — | `"show": [{ "value": true }]` (sometimes, for extension-style properties) |

**Rule of thumb:** Colors in theme JSON are **always** wrapped in `{ "solid": { "color": "..." } }`. Everything else is usually a plain scalar.

## Common category catalog by visual family

The property categories below are the ones that come up in ~95% of theme requests. Each category maps to a subsection of the theme editor in PBI Desktop. The full list is huge — when in doubt, apply a format manually in PBI Desktop, save the theme with "Export current theme", and read the JSON it wrote. This "apply then read back" loop is the same method `CONTRIBUTING.md` section 8 recommends for PBIR gotchas.

### Universal (applies to `*`)

| Category | Key properties | Notes |
|---|---|---|
| `title` | `show`, `text`, `fontColor`, `fontSize`, `fontFamily`, `alignment`, `background` | Visual title bar |
| `background` | `show`, `color`, `transparency` | Canvas behind the visual |
| `border` | `show`, `color`, `radius` | Outer border / rounded corners |
| `dropShadow` | `show`, `position`, `preset` | Card-style shadow |
| `visualHeader` | `show`, `background`, `foreground`, `border`, `transparency` | The `⋯ / pin / focus` header strip |
| `padding` | `top`, `right`, `bottom`, `left` | Inner whitespace |

### Charts — columnChart, barChart, clusteredColumnChart, clusteredBarChart, lineChart, areaChart, combo charts

| Category | Key properties |
|---|---|
| `categoryAxis` | `show`, `fontSize`, `fontFamily`, `labelColor`, `gridlineColor`, `gridlineShow`, `gridlineStyle`, `titleText`, `titleFontSize` |
| `valueAxis` | same as categoryAxis, plus `start`, `end`, `axisScale` (`linear`/`log`) |
| `legend` | `show`, `position`, `fontSize`, `fontFamily`, `labelColor`, `titleText` |
| `labels` / `dataLabels` | `show`, `color`, `fontSize`, `fontFamily`, `labelDisplayUnits`, `labelPrecision`, `labelOrientation` |
| `dataPoint` | `fill`, `showAllDataPoints`, `defaultColor`. Per-series overrides go in an array of objects, each with a `selector` matching a series value. |
| `plotArea` | `transparency`, `image` |
| `zoom` | `show` (column/bar only) |

### Combo charts specifically

Combo charts (`lineStackedColumnComboChart`, `lineClusteredColumnComboChart`) have **separate** axis categories:
- `categoryAxis` — shared X axis
- `valueAxis` — column Y axis (left)
- `secondaryValueAxis` — line Y axis (right)
- `labels` — column labels
- `lineLabels` — line labels (distinct)

### Tables and matrices — tableEx, pivotTable

| Category | Key properties |
|---|---|
| `grid` | `gridVertical`, `gridHorizontal`, `gridVerticalColor`, `gridHorizontalColor`, `gridVerticalWeight`, `gridHorizontalWeight`, `rowPadding`, `outlineColor`, `outlineWeight`, `imageHeight` (for SVG visual row height) |
| `columnHeaders` | `fontColor`, `backColor`, `fontSize`, `fontFamily`, `fontWeight`, `alignment`, `wordWrap`, `autoSizeColumnWidth` |
| `rowHeaders` | same as columnHeaders (matrix only) |
| `values` | `fontColor`, `backColor`, `fontColorPrimary`, `backColorPrimary` (primary = alternating odd rows), `fontSize`, `wordWrap`, `urlIcon` |
| `total` | `fontColor`, `backColor`, `fontSize`, `fontFamily`, `fontWeight`, `applyToHeaders` |
| `subTotals` | Matrix: `rowSubtotals`, `columnSubtotals`, `rowSubtotalsPosition`, `perLevel` |

### Cards — card (classic), cardVisual (new), multiRowCard, kpi

| Visual | Category | Key properties |
|---|---|---|
| `card` | `labels` | `color`, `fontSize`, `fontFamily`, `labelDisplayUnits`, `labelPrecision` |
| `card` | `categoryLabels` | `show`, `color`, `fontSize`, `fontFamily` |
| `card` | `wordWrap` | `show` |
| `cardVisual` | `callout` | `fontSize`, `fontFamily`, `color`, `labelDisplayUnits` |
| `cardVisual` | `accentBar` | `show`, `color`, `width` |
| `multiRowCard` | `dataLabels`, `categoryLabels`, `cardTitle`, `card` (spacing) | as above |
| `kpi` | `indicator` | `fontSize`, `fontFamily`, `color`, `labelDisplayUnits` |
| `kpi` | `trendAxis` | `show`, `lineColor`, `transparency` |
| `kpi` | `goals` | `show`, `distanceColor`, `goalColor` |

### Slicers — slicer, listSlicer, textSlicer, advancedSlicerVisual

| Category | Key properties |
|---|---|
| `general` | `orientation` (`horizontal`/`vertical`), `selection` (single/multi) |
| `header` | `show`, `fontColor`, `background`, `fontSize`, `fontFamily`, `outline` |
| `items` | `fontColor`, `background`, `fontSize`, `fontFamily`, `outline`, `padding` |
| `selectionControls` | `checkboxColor`, `hoverColor`, `tileColor` (list slicer) |
| `slider` | `color` (numeric/date range slicers) |
| `dateInputs` | `fontColor`, `fontSize` (date slicers) |
| `dropdown` | `fontColor`, `background` (dropdown slicer) |

### Maps — map, filledMap, azureMap

| Category | Key properties |
|---|---|
| `mapStyles` | `mapTheme` (road/aerial/grayscale/dark) |
| `mapControls` | `autoZoom`, `zoomPanControls` |
| `heatMap` | `radius`, `intensity` (azureMap) |
| `bubbles` | `size`, `strokeColor` (map) |
| `shapes` | `borderColor`, `borderWidth` (filledMap) |

## Examples

### Make every visual use a 10pt Segoe UI title
```json
"visualStyles": {
  "*": {
    "*": {
      "title": [
        { "fontFamily": "Segoe UI Semibold", "fontSize": 10, "fontColor": { "solid": { "color": "#1A1A1A" } } }
      ]
    }
  }
}
```

### All tables: 9pt values, alternating-row background, no vertical gridlines
```json
"visualStyles": {
  "tableEx": {
    "*": {
      "values": [
        { "fontSize": 9, "fontFamily": "Segoe UI",
          "backColor":        { "solid": { "color": "#FFFFFF" } },
          "backColorPrimary": { "solid": { "color": "#F7F7F7" } } }
      ],
      "grid": [
        { "gridVertical": false, "gridHorizontal": true,
          "gridHorizontalColor": { "solid": { "color": "#E5E5E5" } },
          "rowPadding": 3 }
      ],
      "columnHeaders": [
        { "fontSize": 9, "fontWeight": "Bold",
          "backColor": { "solid": { "color": "#0078D4" } },
          "fontColor": { "solid": { "color": "#FFFFFF" } } }
      ]
    }
  }
}
```

### Column chart: always show data labels, hide value axis
```json
"visualStyles": {
  "columnChart": {
    "*": {
      "dataLabels": [{ "show": true, "fontSize": 9, "labelDisplayUnits": 1000 }],
      "valueAxis":  [{ "show": false }]
    }
  },
  "clusteredColumnChart": {
    "*": {
      "dataLabels": [{ "show": true, "fontSize": 9, "labelDisplayUnits": 1000 }],
      "valueAxis":  [{ "show": false }]
    }
  }
}
```

Note: theme rules target each visual type literally. `columnChart` rules do **not** cascade to `clusteredColumnChart` — duplicate the block for each type in the family, or put shared rules under `*`.

### KPI: green trend line, hide goals
```json
"visualStyles": {
  "kpi": {
    "*": {
      "trendAxis": [
        { "show": true, "lineColor": { "solid": { "color": "#22C55E" } } }
      ],
      "goals": [{ "show": false }]
    }
  }
}
```

## Workflow

1. **Start from an existing theme.** Call `get_report_theme` to dump what's currently applied. If there's no custom theme, `set_report_theme` with the built-in base you want (e.g. `"CY26SU02"`) first, then read it back.
2. **Build the `visualStyles` block** using the categories above. Keep report-wide rules in `"*"."*"` and narrow rules in the specific visual type. Don't mix report-level properties (like `dataColors`) inside `visualStyles` — they live at the top level.
3. **Apply with `set_report_theme`** passing the full theme JSON (not just the diff). The tool round-trips the JSON through PBI Desktop's theme loader on the next `reload_report`.
4. **Preview changes first** with `diff_report_theme` — it returns added/removed/changed/unchanged buckets so you can catch accidental overwrites before committing.
5. **Verify in PBI Desktop**: save, close, reopen. If a visual doesn't honor a rule, the property name is probably wrong — apply the format manually via the format pane, export the theme, and copy the exact key out of the exported JSON.

## Gotchas

- **Arrays, not objects.** Every category value must be an array of one-or-more property objects, even if you only need one. `{ "title": { ... } }` silently does nothing; `{ "title": [{ ... }] }` works.
- **Colors are wrapped.** `"color": "#3B82F6"` will be ignored; you need `"color": { "solid": { "color": "#3B82F6" } }`.
- **Property names are case-sensitive** and use camelCase (`fontSize`, not `fontsize` or `font_size`).
- **Unknown properties are silently dropped** — PBI Desktop won't warn you if you misspell a key. Always verify with a round-trip through the format pane.
- **Classic card vs new card vs KPI** use different category names for the headline number. Don't assume `labels` works everywhere.
- **Combo charts** have `valueAxis` AND `secondaryValueAxis` — a theme rule on `valueAxis` alone leaves the right-side axis un-themed.
- **Themes do not override inline `format_visual` writes.** If a visual has per-visual container formatting set by `format_visual` or inline `containerFormat` on `add_visual`, those win over the theme. Clear inline formatting first if you want the theme to take over.

## Related files

- `skills/themes.md` — `set_report_theme`, `get_report_theme`, `diff_report_theme`, theme audit
- `skills/formatting.md` — per-visual inline formatting (`format_visual`, `containerFormat`, `visualFormat`)
- `skills/visuals.md` — the `visualType` ID reference used as keys in `visualStyles`
- [Microsoft: Use report themes](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes) — the canonical schema reference
