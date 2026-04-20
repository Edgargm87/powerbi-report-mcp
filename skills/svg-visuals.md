<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
<!-- summary: Measure-driven SVG patterns — sparklines, bullets, progress bars, gauges rendered as DAX measures and embedded via image URL category. Advanced visual composition. -->
# SVG Visuals in Power BI

SVG visuals are **DAX measures that return inline SVG strings** rendered as images in native visuals.
No custom visuals or external dependencies needed.

## How It Works

A DAX measure constructs an SVG markup string and returns it as a data URI:
```
"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='20'>...</svg>"
```

The measure metadata must be set to:
- **dataType**: `"String"` (or `"Text"` for extension measures)
- **dataCategory**: `"ImageUrl"`

## Where to Store

| Path | Tool | Stored in |
|------|------|-----------|
| **Model measure** | modeling MCP → `measure_operations(Create)` | Semantic model (shared across reports) |
| **Extension measure** | report MCP → `manage_extension_measures(add)` | reportExtensions.json (report-scoped) |

For model measures, set `dataCategory: "ImageUrl"` in the Create call.
For extension measures, set `dataType: "Text"` — bind the visual, then PBI renders it as an image.

## Supported Visuals

| Visual Type | visualType ID | How to bind |
|-------------|--------------|-------------|
| **Table** | `tableEx` | Add SVG measure to `Values` bucket |
| **Matrix** | `pivotTable` | Add SVG measure to `Values` bucket |
| **Image** | `image` | Bind to image source field |
| **New Card** | `cardVisual` | Add SVG measure to `Data` bucket |
| **New Slicer** | `advancedSlicerVisual` | Bind to header image |

**Classic card does NOT support SVG** — only the new card visual works.

After binding to a Table/Matrix, format the column: set `grid.imageHeight` to control SVG row height.

## DAX Structure Convention

Every SVG measure follows 4 sections:

```dax
MyMeasure =
// === CONFIG === (user-modifiable inputs)
VAR _Value = [Total Sales]
VAR _Max = CALCULATE(MAX(...), REMOVEFILTERS(...)) * 1.1
VAR _Color = "#3B82F6"

// === NORMALIZATION === (scale to SVG coordinates)
VAR _Width = DIVIDE(_Value, _Max) * 150

// === SVG ELEMENTS === (one VAR per element)
VAR _Bar = "<rect x='0' y='2' width='" & _Width & "' height='16' rx='3' fill='" & _Color & "'/>"
VAR _Label = "<text x='" & _Width + 5 & "' y='14' font-size='11' fill='#94A3B8'>" & FORMAT(_Value, "#,0") & "</text>"

// === ASSEMBLY === (first = back layer, last = front)
VAR _SVG = _Bar & _Label
RETURN "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='20'>" & _SVG & "</svg>"
```

## Conventions & Rules

- **Single quotes** for SVG attributes (DAX strings use double quotes)
- **Hex colors** with `#` directly — never `%23`, never named colors
- **No JavaScript** — Power BI strips it
- **32K character limit** on the rendered SVG string
- **HASONEVALUE guard** — prevent SVG on total/subtotal rows:
  ```dax
  IF(HASONEVALUE(Table[Category]), _SVG_Result, BLANK())
  ```
- **Sort trick** — embed a `<desc>` tag for numeric sorting:
  ```dax
  "<desc>" & FORMAT(_Value, "000000000000") & "</desc>"
  ```
- **Axis normalization** — compute max across all rows for consistent bar widths:
  ```dax
  VAR _Max = CALCULATE(MAXX(_AllRows, [Measure]), REMOVEFILTERS('Table'[GroupCol])) * 1.1
  ```

## Templates

### 1. Progress Bar (conditional color)
```dax
Progress Bar =
VAR _Pct = DIVIDE([Total Sales], [Total Gross Sales])
VAR _W = ROUND(_Pct * 120, 0)
VAR _Color = SWITCH(TRUE(),
    _Pct >= 0.8, "#22C55E",
    _Pct >= 0.5, "#F59E0B",
    "#EF4444"
)
VAR _Bar = "<rect x='0' y='2' width='" & _W & "' height='14' rx='4' fill='" & _Color & "'/>"
VAR _Track = "<rect x='0' y='2' width='120' height='14' rx='4' fill='#1E293B' opacity='0.3'/>"
VAR _Label = "<text x='126' y='14' font-size='10' fill='#94A3B8' font-family='Segoe UI'>" & FORMAT(_Pct, "0%") & "</text>"
RETURN
"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='18'>" & _Track & _Bar & _Label & "</svg>"
```

### 2. Status Pill
```dax
Status Pill =
VAR _Segment = SELECTEDVALUE('Table'[Segment])
VAR _Color = SWITCH(_Segment,
    "Government", "#3B82F6",
    "Enterprise", "#8B5CF6",
    "Midmarket", "#F59E0B",
    "Small Business", "#22C55E",
    "Channel Partners", "#EC4899",
    "#64748B"
)
VAR _W = LEN(_Segment) * 7 + 16
RETURN
"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='" & _W & "' height='22'><rect x='0' y='1' width='" & _W & "' height='20' rx='10' fill='" & _Color & "' opacity='0.15'/><text x='" & _W / 2 & "' y='15' text-anchor='middle' font-size='11' font-family='Segoe UI' fill='" & _Color & "'>" & _Segment & "</text></svg>"
```

### 3. Sparkline (for Table/Matrix rows)
```dax
Sparkline =
VAR _Dates = SUMMARIZE(ALLSELECTED('Date'), 'Date'[Month Number], "Val", [Total Sales])
VAR _Max = MAXX(_Dates, [Val]) * 1.1
VAR _Count = COUNTROWS(_Dates) - 1
VAR _Points = CONCATENATEX(
    _Dates,
    VAR _X = ([Month Number] - 1) / MAX(_Count, 1) * 140
    VAR _Y = 28 - DIVIDE([Val], _Max) * 26
    RETURN _X & "," & _Y,
    " ",
    [Month Number], ASC
)
RETURN
IF(HASONEVALUE('Table'[Product]),
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='30'><polyline points='" & _Points & "' fill='none' stroke='#3B82F6' stroke-width='1.5'/></svg>",
    BLANK()
)
```

### 4. Bullet Chart (actual vs target)
```dax
Bullet Chart =
VAR _Actual = [Total Sales]
VAR _Target = [Total Sales] * 0.9
VAR _Max = CALCULATE(MAXX(ALL('Table'[Segment]), [Total Sales]), REMOVEFILTERS()) * 1.1
VAR _ActW = DIVIDE(_Actual, _Max) * 140
VAR _TgtX = DIVIDE(_Target, _Max) * 140
VAR _BG = "<rect x='0' y='4' width='140' height='12' rx='2' fill='#1E293B' opacity='0.3'/>"
VAR _Bar = "<rect x='0' y='5' width='" & _ActW & "' height='10' rx='2' fill='#3B82F6'/>"
VAR _Target_Line = "<line x1='" & _TgtX & "' y1='2' x2='" & _TgtX & "' y2='18' stroke='#F8FAFC' stroke-width='2'/>"
RETURN
IF(HASONEVALUE('Table'[Segment]),
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='20'>" & _BG & _Bar & _Target_Line & "</svg>",
    BLANK()
)
```

## Workflow

1. Call `guide("svg-visuals")` — you're reading this now
2. Create the SVG DAX measure:
   - Model measure: `measure_operations({ operation: "Create", definitions: [{ name, expression, dataType: "String", dataCategory: "ImageUrl", tableName }] })`
   - Extension measure: `manage_extension_measures({ operation: "add", measureName, expression, dataType: "Text" })`
3. Add visual: `add_visual({ visualType: "tableEx", bindings: [{ bucket: "Values", fields: [..., { type: "measure", field: "Table[SVG Measure]" }] }] })`
4. Format image height: `format_visual({ target: "visual", categories: [{ category: "grid", properties: { imageHeight: 20 } }] })`

## Community UDF Libraries

Before writing custom DAX, check these pre-built SVG libraries:
- **PowerofBI.IBCS** — IBCS-compliant bars, columns, waterfalls (daxlib.org)
- **DaxLib.SVG** — 3-tier API: Viz.*/Compound.*/Element.* for area, bars, boxplot, heatmap, jitter, line, pill, progress
- **PowerBI MacGuyver Toolbox** — 20+ bar, 14+ line, 24+ KPI templates
- **Kerry Kolosko Templates** — Sparklines, data bars, gauges, KPI cards, waterfalls

## Where the DAX Actually Lives

SVG measures are **model-level DAX**, not report-layer JSON. This MCP (`powerbi-report-mcp`) doesn't author DAX — it only binds existing measures into visuals. When you need a new SVG measure:

- **Primary path** — use the sibling `powerbi-modeling-mcp` (Microsoft's official modeling MCP) via `measure_operations(Create)` with `dataType: "String"` and `dataCategory: "ImageUrl"`. That MCP ships its own skill documentation; it is the authority for anything that lives in the semantic model.
- **Fallback** — if the measure must be report-scoped (no write access to the model, or the DAX shouldn't leak into other reports), use `manage_extension_measures(add)` with `dataType: "Text"`. Extension measures are stored in `reportExtensions.json` inside the `.Report` folder and behave like model measures for binding purposes.

Once the measure exists (in either location), come back to this MCP for the `add_visual` / `format_visual` steps listed in the Workflow section above.

### Canonical DAX references

If you're writing the SVG construction by hand (rather than having Claude compose it), these are the free, authoritative sources for DAX syntax and patterns. They're the same references Microsoft Learn links to:

- **[daxpatterns.com](https://www.daxpatterns.com/)** — SQLBI pattern library
- **[dax.guide](https://dax.guide/)** — SQLBI DAX function reference
- **[Microsoft DAX reference](https://learn.microsoft.com/en-us/dax/dax-function-reference)** — official function docs

Nothing in the templates above is proprietary — they use standard DAX functions (`SWITCH`, `CONCATENATEX`, `SUMMARIZE`, `DIVIDE`, `FORMAT`, `MAXX`, `HASONEVALUE`) combined with SVG string concatenation. If an agent doesn't recognize a function in one of the templates, those three links are the places to look it up.
