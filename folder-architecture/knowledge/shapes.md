<!-- mirrored from skills/shapes.md at v0.9.6 (08eda17) -->

<!-- doc-version: 2.0 | Last updated: 2026-04-14 -->
<!-- summary: Rectangles, rounded corners, banners, dividers, tab cuts, embedded text labels via objects.text. Use for wireframe scaffolding and section framing. -->
# Skill: Shapes — Rectangles, Banners, Dividers, Labelled Blocks

## When to use
Shapes are the go-to for background panels, section headers, colour blocks, dividers, KPI
chrome, badges, wireframe placeholders, and any other piece of decorative or
layout-only geometry. All use `visualType: "shape"` (the legacy alias `"basicShape"` is
auto-normalised to `"shape"`).

Shapes can carry **text labels** directly — no textbox overlay required. Use this any
time you want a rectangle, pill, or banner to display a short piece of text
(section titles, card headers, wireframe role labels, status badges, etc.).

## Core tool: `pbir_add_visual` with `visualType: "shape"`

### Minimal shape (no text)
```json
{
  "pageId": "<id>",
  "visualType": "shape",
  "x": 0, "y": 0,
  "width": 1280, "height": 52,
  "shapeType": "rectangle",
  "fillColor": "#1F3864"
}
```

### Shape with a text label
```json
{
  "pageId": "<id>",
  "visualType": "shape",
  "x": 20, "y": 57,
  "width": 244, "height": 90,
  "shapeType": "rectangle",
  "fillColor": "#E8EEF4",
  "textContent": "Total Revenue",
  "textColor": "#1B2A4A",
  "textAlign": "center",
  "textVAlign": "middle",
  "textPadding": 8
}
```

That single call produces a rectangle with the text rendered **inside the shape itself**
— no separate textbox, no z-order juggling.

## Shape Types

| shapeType | Description |
|---|---|
| `rectangle` | Standard rectangle |
| `rectangleRounded` | Rounded-corner rectangle |
| `line` | Horizontal or vertical line |
| `tabCutCorner` | Tab with one cut corner |
| `tabCutTopCorners` | Tab with both top corners cut |
| `tabRoundCorner` | Tab with one rounded corner |
| `tabRoundTopCorners` | Tab with both top corners rounded |

## Text Properties

All of these are optional. Provide `textContent` to enable the label; everything else
has sensible defaults.

| Property | Type | Notes |
|---|---|---|
| `textContent` | string | Text displayed inside the shape. Required to enable the label. Single-quotes are auto-escaped for PBIR. |
| `textColor` | hex string | e.g. `"#FFFFFF"`. If omitted, uses theme data color 1 (matches Power BI Desktop default). |
| `textAlign` | `"left"` / `"center"` / `"right"` | Horizontal alignment. Default = Power BI default (left). |
| `textVAlign` | `"top"` / `"middle"` / `"bottom"` | Vertical alignment. Default = Power BI default (top). |
| `textPadding` | number (px) | Inner padding applied to all 4 sides. Typical: 5–10px for card labels, 0 for full-bleed banners. |
| `textBold` | boolean | Bold toggle. Emits `bold: true` under `objects.text`. |
| `textItalic` | boolean | Italic toggle. Emits `italic: true` under `objects.text`. |
| `textUnderline` | boolean | Underline toggle. Emits `underline: true` under `objects.text`. |
| `textSize` | number (pt) | Font size in points. Emits `fontSize: ND` (double literal). |
| `textFont` | string | Font family. Friendly names like `"Segoe UI Bold"`, `"Arial"`, `"DIN"` are auto-mapped to the full Power BI font stack. Unknown values are passed through verbatim as the stack, so you can hand-author custom stacks if needed. See the font list below. |

### Supported friendly font names

Pass any of these as `textFont` and the writer expands them to the full PBIR stack:

| Friendly name | Use for |
|---|---|
| `"Segoe UI"` | Default body font (modern Power BI theme) |
| `"Segoe UI Bold"` | Bold headline face (separate file — distinct from `textBold`) |
| `"Segoe UI Light"` | Thin headline face |
| `"Segoe UI Semibold"` | Between regular and bold |
| `"DIN"` | Power BI's classic default title font (`wf_standard-font` stack) |
| `"Arial"`, `"Arial Black"` | Generic sans-serif |
| `"Calibri"`, `"Cambria"`, `"Candara"`, `"Constantia"`, `"Corbel"` | Office-family alternatives |
| `"Consolas"`, `"Courier New"`, `"Lucida Console"` | Monospace |
| `"Georgia"`, `"Times New Roman"` | Serif |
| `"Tahoma"`, `"Trebuchet MS"`, `"Verdana"`, `"Comic Sans MS"` | Other common UI fonts |

**Escape hatch:** if you pass a `textFont` value that is *not* in the map, the writer uses
it verbatim as the stack. This lets you hand-author custom stacks like
`"'MyBrand Display', sans-serif"` — the DAX-literal quote escaping is handled for you.

### `textBold` vs `textFont: "Segoe UI Bold"`

These are two different things:
- `textBold: true` flips the `bold` boolean under `objects.text` — Power BI renders the
  current font in its bold weight.
- `textFont: "Segoe UI Bold"` switches to a *separate font family* that has "Bold" baked
  into its name. Some Power BI themes only ship the regular face, so `textBold` may
  render slightly differently than selecting "Segoe UI Bold" as the family.

If you want the same look as Power BI Desktop's "Segoe UI Bold" dropdown option, use
`textFont: "Segoe UI Bold"`. If you just want bold weight applied to whatever font is
selected, use `textBold: true`.

### Under the hood (PBIR schema)

The writer emits shape text into `visual.objects.text` as a **two-entry format-object
array** — this is the structure Power BI Desktop actually renders. It is *not* the same
as the `general.paragraphs` structure used by textboxes:

```json
"visual": {
  "visualType": "shape",
  "objects": {
    "shape":   [ { "properties": { "tileShape": { "expr": { "Literal": { "Value": "'rectangle'" } } } } } ],
    "fill":    [ { "properties": { "fillColor": { "solid": { "color": { "expr": { "Literal": { "Value": "'#E8EEF4'" } } } } } }, "selector": { "id": "default" } } ],
    "outline": [ { "properties": { "show": { "expr": { "Literal": { "Value": "false" } } } } } ],
    "text": [
      {
        "properties": {
          "show": { "expr": { "Literal": { "Value": "true" } } }
        }
      },
      {
        "properties": {
          "text": { "expr": { "Literal": { "Value": "'Total Revenue'" } } },
          "fontColor": {
            "solid": { "color": { "expr": { "Literal": { "Value": "'#1B2A4A'" } } } }
          },
          "horizontalAlignment": { "expr": { "Literal": { "Value": "'center'" } } },
          "verticalAlignment":   { "expr": { "Literal": { "Value": "'middle'" } } },
          "fontSize":   { "expr": { "Literal": { "Value": "12D" } } },
          "fontFamily": { "expr": { "Literal": { "Value": "'''Segoe UI Bold'', wf_segoe-ui_bold, helvetica, arial, sans-serif'" } } },
          "bold":      { "expr": { "Literal": { "Value": "true" } } },
          "italic":    { "expr": { "Literal": { "Value": "true" } } },
          "underline": { "expr": { "Literal": { "Value": "true" } } },
          "leftMargin":   { "expr": { "Literal": { "Value": "8L" } } },
          "topMargin":    { "expr": { "Literal": { "Value": "8L" } } },
          "rightMargin":  { "expr": { "Literal": { "Value": "8L" } } },
          "bottomMargin": { "expr": { "Literal": { "Value": "8L" } } }
        },
        "selector": { "id": "default" }
      }
    ]
  }
}
```

Key rules:

1. **Two entries, always.** Entry `[0]` is just the `show: true` toggle (no selector).
   Entry `[1]` carries the real properties and must include `selector: { id: "default" }`.
2. **Text value is a DAX literal** — single-quoted inside the JSON string (`"'Total Revenue'"`),
   and internal single quotes are doubled (`'Jonny''s Pie'`). The writer handles this.
3. **Default font colour is the theme colour, not a hex.** Emitted as
   `ThemeDataColor { ColorId: 1 }` unless you pass an explicit `textColor`. This means
   labels auto-invert when the theme changes.
4. **Alignments and padding are independent** — `horizontalAlignment`, `verticalAlignment`,
   and the four `*Margin` properties can each be set or omitted individually.
5. **Padding uses `L` integer literals**, not `D` doubles — the margin values are in pixels.
6. **`fontSize` is a `D` double literal** (e.g. `12D` for 12pt). **`fontFamily`** is a
   CSS-style font stack wrapped as a single DAX literal — if the stack contains names
   with spaces (like `'Segoe UI Bold'`), those inner CSS single quotes must be doubled
   inside the DAX literal. The writer's `textFont` property handles both for you.

### Why not `general.paragraphs`?

Power BI's `general.paragraphs` branch is for **textboxes** (`visualType: "textbox"`).
Shapes read text from `objects.text`. Writing shape text into `general.paragraphs`
serializes to disk without error but **does not render** in Power BI Desktop — the
text is silently ignored. Always use the `objects.text` branch for shapes.

## Rotation
Use `shapeRotation` (degrees) to rotate a shape:
```json
{ "shapeType": "line", "shapeRotation": 90, "width": 2, "height": 200 }
```

## Typical Layout Patterns

### Full-width banner with title
```json
{
  "visualType": "shape",
  "x": 0, "y": 0, "width": 1280, "height": 52,
  "shapeType": "rectangle",
  "fillColor": "#1B2A4A",
  "textContent": "Sales Dashboard",
  "textColor": "#FFFFFF",
  "textAlign": "center",
  "textVAlign": "middle",
  "textFont": "Segoe UI Bold",
  "textSize": 16
}
```

### Section divider (thin horizontal line, no text)
```json
{
  "visualType": "shape",
  "x": 20, "y": 660, "width": 1240, "height": 2,
  "shapeType": "line",
  "fillColor": "#D1D5DB"
}
```

### Card background panel with label
```json
{
  "visualType": "shape",
  "x": 20, "y": 80, "width": 380, "height": 200,
  "shapeType": "rectangleRounded",
  "fillColor": "#F8F9FA",
  "textContent": "Regional Performance",
  "textColor": "#1B2A4A",
  "textAlign": "left",
  "textVAlign": "top",
  "textPadding": 12
}
```

### Labelled pill / status badge
```json
{
  "visualType": "shape",
  "x": 100, "y": 10, "width": 120, "height": 32,
  "shapeType": "rectangleRounded",
  "fillColor": "#3FB950",
  "textContent": "On Track",
  "textColor": "#FFFFFF",
  "textAlign": "center",
  "textVAlign": "middle",
  "textBold": true
}
```

### Wireframe placeholder block (shape as stand-in for a future visual)
```json
{
  "visualType": "shape",
  "x": 20, "y": 152, "width": 617, "height": 280,
  "shapeType": "rectangle",
  "fillColor": "#D6E4F0",
  "textContent": "CHART LEFT — columnChart",
  "textColor": "#1B2A4A",
  "textAlign": "center",
  "textVAlign": "middle"
}
```

This is the "shape-as-label" pattern used by `skills/wireframes.md` — one shape per
intended visual, with the role and visual type baked into the shape's own text.

## Z-order (Layering)
Shapes are typically placed as background layers. Create them **before** data visuals so
they have lower z-order values and appear behind charts and slicers. For labelled shapes
used as wireframe placeholders, this doesn't matter — they're the only thing on the page.

## Common Wireframe / Banner Conventions
- **Banner**: full-width rectangle at `y=0, height=52`, dark brand colour, centred white
  bold text (font size best-effort — Power BI Desktop may size the label itself).
- **KPI row**: 3–5 card rectangles at `y=57`, each with a short centred label.
- **Chart area**: larger rectangles below the KPI row, labels top-left with
  `textPadding: 12`.
- **Sidebar** (if any): narrow rectangle on left or right, full height, vertical label
  if needed (rotate with `shapeRotation: 270`).

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Shape renders but text is missing in Power BI Desktop | Text was written to `general.paragraphs` instead of `objects.text` | Use `pbir_add_visual` from this skill — it emits the correct branch. |
| PBIR file is valid but text shows the wrong string | Single quote in `textContent` wasn't escaped | The writer doubles `'` → `''` automatically. If you're hand-editing JSON, do it manually. |
| Label is flush against the shape edge | No `textPadding` set | Pass `textPadding: 8` (or higher). |
| Label defaults to top-left | `verticalAlignment` / `horizontalAlignment` defaults | Always set both `textAlign` and `textVAlign` for predictable positioning. |
| Custom font doesn't render | `textFont` value isn't in the friendly-name map and your raw stack is malformed | Pass a known friendly name (`"Segoe UI"`, `"DIN"`, etc.) or a well-formed CSS font stack. The writer wraps the stack as a DAX literal and escapes internal single quotes — you just need the raw comma-separated font list. |
