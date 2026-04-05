# Skill: Formatting — Visual Styling, Themes, Titles, Colors

## Overview
There are three layers of formatting in Power BI PBIR:

| Layer | What it controls | Tool / where to set |
|---|---|---|
| Container | background, border, padding, title, dropShadow, visualHeader | `containerFormat` in `add_visual` or `format_visual target="container"` |
| Visual objects | axes, legend, labels, lineStyles, dataPoint colors, slicer items | `visualFormat` in `add_visual` or `format_visual target="visual"` |
| Title | text, show, fontSize, fontFamily, alignment, titleWrap | `set_visual_title` or title in `containerFormat` |

## Inline formatting (recommended)
Set formatting at creation time using `add_visual` inline params — no extra tool calls needed:
```json
{
  "visualType": "columnChart",
  "containerFormat": [
    { "category": "background", "properties": { "show": true, "color": "#FFFFFF", "transparency": 0 } },
    { "category": "border",     "properties": { "show": true, "color": "#E0E0E0", "radius": 8 } },
    { "category": "visualHeader", "properties": { "show": false } }
  ],
  "visualFormat": [
    { "category": "categoryAxis", "properties": { "fontSize": 9 } },
    { "category": "valueAxis",    "properties": { "fontSize": 9 } },
    { "category": "labels",       "properties": { "show": true, "fontSize": 8 } }
  ],
  "dataColors": [
    { "color": "#4A90D9" },
    { "color": "#50B748" },
    { "color": "#F5A623" }
  ]
}
```

## format_visual
Update formatting on an existing visual:
```json
// Container layer
{ "pageId": "...", "visualId": "...", "target": "container",
  "formatting": [
    { "category": "background", "properties": { "show": true, "color": "#F0F4FF", "transparency": 0 } }
  ] }

// Visual layer
{ "pageId": "...", "visualId": "...", "target": "visual",
  "formatting": [
    { "category": "legend", "properties": { "show": true, "position": "Bottom", "fontSize": 9 } }
  ] }
```

## Property encoding rules
The `buildFormattingProps` helper auto-encodes values:

| Value type | Example | PBIR encoding |
|---|---|---|
| Hex colour | `"#FF0000"` | `{ solid: { color: { expr: { Literal: { Value: "'#FF0000'" } } } } }` |
| Boolean | `true` | `{ expr: { Literal: { Value: "true" } } }` |
| Number | `8` | `{ expr: { Literal: { Value: "8D" } } }` |
| String | `"Bottom"` | `{ expr: { Literal: { Value: "'Bottom'" } } }` |

You never need to handle this manually — just pass raw JS values in `properties`.

## Common container categories

| category | Key properties |
|---|---|
| `background` | `show`, `color`, `transparency` |
| `border` | `show`, `color`, `radius` |
| `title` | `show`, `text`, `fontSize`, `fontFamily`, `alignment`, `titleWrap` |
| `padding` | `top`, `bottom`, `left`, `right` |
| `dropShadow` | `show`, `position` (`"Outer"` / `"Inner"`) |
| `visualHeader` | `show` |

## Common visual categories

| category | Key properties |
|---|---|
| `categoryAxis` | `show`, `fontSize`, `fontFamily`, `gridlines` |
| `valueAxis` | `show`, `fontSize`, `start`, `end` |
| `legend` | `show`, `position`, `fontSize` |
| `labels` | `show`, `fontSize`, `color` |
| `lineStyles` | `strokeWidth`, `lineStyle` |
| `items` | `textSize`, `fontFamily` (slicers) |
| `header` | `textSize`, `fontFamily` (slicers) |
| `dataPoint` | set via `set_datapoint_colors` or `dataColors` array |

## Themes
Apply consistent styling to all visuals on a page in one call:

```json
{ "pageId": "...", "theme": "dark" }
{ "pageId": "...", "theme": "light" }
{ "pageId": "...", "theme": "corporate" }
{ "pageId": "...", "theme": "blue-purple" }
```

Available themes: `dark`, `light`, `corporate`, `blue-purple`

Themes skip `textbox`, `shape`, and `image` visuals automatically.
Slicers use a separate `slicerContainerFormat` if defined in the theme.

## set_visual_title
Quick-set a title without touching other formatting:
```json
{ "pageId": "...", "visualId": "...",
  "title": "Revenue by Region",
  "show": true,
  "fontSize": 11,
  "alignment": "left" }
```

## set_datapoint_colors
Override colours for specific series:
```json
{ "pageId": "...", "visualId": "...",
  "colors": [
    { "color": "#CD191C", "seriesName": "Actual" },
    { "color": "#4A90D9", "seriesName": "Budget" }
  ],
  "defaultTransparency": 10 }
```

## Default fonts applied automatically
`createAndSaveVisual` sets these defaults on every visual created:
- Title: `fontSize: 8`, Segoe UI
- Chart axes/legend/labels: `fontSize: 8`, Segoe UI
- Slicer items/header: `textSize: 8`, Segoe UI

Override via `containerFormat` or `visualFormat` in the same `add_visual` call.
