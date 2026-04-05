# Skill: Shapes — Rectangles, Banners, Dividers, Decorative Elements

## When to use
Use shapes to create background panels, section headers, colour blocks, dividers, and decorative
layout elements. All use `visualType: "shape"` (or `"basicShape"` — auto-normalised).

## Core tool: `add_visual` with `visualType: "shape"`

### Minimal shape
```json
{
  "pageId": "<id>",
  "visualType": "shape",
  "x": 0, "y": 0,
  "width": 1280, "height": 60,
  "shapeType": "rectangle",
  "fillColor": "#1F3864"
}
```

### Shape with text label
```json
{
  "pageId": "<id>",
  "visualType": "shape",
  "x": 20, "y": 10,
  "width": 300, "height": 50,
  "shapeType": "rectangleRounded",
  "fillColor": "#2E75B6",
  "textContent": "Section Title",
  "textColor": "#FFFFFF",
  "textBold": true,
  "textSize": 12,
  "textAlign": "center"
}
```

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

| Property | Type | Notes |
|---|---|---|
| `textContent` | string | Text displayed inside the shape |
| `textColor` | hex string | e.g. `"#FFFFFF"` |
| `textAlign` | `"left"` / `"center"` / `"right"` | Default: `"center"` |
| `textSize` | number | Font size in pt, e.g. `12` |
| `textBold` | boolean | `true` for bold text |

## Rotation
Use `shapeRotation` (degrees) to rotate a shape:
```json
{ "shapeType": "line", "shapeRotation": 90, "width": 2, "height": 200 }
```

## Typical Layout Patterns

### Full-width header bar
```json
{ "visualType": "shape", "x": 0, "y": 0, "width": 1280, "height": 56,
  "shapeType": "rectangle", "fillColor": "#1F3864" }
```

### Section divider (thin horizontal line)
```json
{ "visualType": "shape", "x": 20, "y": 660, "width": 1240, "height": 2,
  "shapeType": "line", "fillColor": "#D1D5DB" }
```

### Card background panel
```json
{ "visualType": "shape", "x": 20, "y": 80, "width": 380, "height": 200,
  "shapeType": "rectangleRounded", "fillColor": "#F8F9FA" }
```

### Icon placeholder circle (use rectangle + round corners approximation)
```json
{ "visualType": "shape", "x": 30, "y": 90, "width": 48, "height": 48,
  "shapeType": "rectangleRounded", "fillColor": "#2E75B6" }
```

### Labelled pill / badge
```json
{ "visualType": "shape", "x": 100, "y": 10, "width": 120, "height": 32,
  "shapeType": "rectangleRounded", "fillColor": "#3FB950",
  "textContent": "On Track", "textColor": "#FFFFFF", "textBold": true, "textSize": 9 }
```

## Z-order (Layering)
Shapes are typically placed as background layers. Create them **before** data visuals so they
have lower z-order values and appear behind charts and slicers.

## Common Wireframe Conventions
- Header bar: full-width rectangle at y=0, height=56, dark brand colour
- Logo area: rounded rectangle or textbox top-left of header
- Page title: textbox inside or below header
- KPI row: 3–5 card backgrounds evenly spaced below header
- Chart area: larger panels below KPI row
- Sidebar (if any): narrow rectangle on left or right, full height
