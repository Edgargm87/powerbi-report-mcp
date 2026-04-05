# Skill: Slicers — Filters & Selection Controls

## The 4 Slicer Visual Types

Power BI has four distinct slicer visual types. Each is a **separate visualType** — they are NOT modes of each other.

| visualType | What it is | Use for |
|---|---|---|
| `slicer` | Classic slicer — supports Dropdown or Basic (list) mode | Most common — date, text, numeric columns |
| `listSlicer` | Always-expanded checkbox list | Multi-select from a short list |
| `textSlicer` | Text search / contains filter box | Free-text search on a column |
| `advancedSlicerVisual` | Advanced slicer with range/between support | Numeric ranges, date ranges |

**Do not set `slicerMode` on `listSlicer`, `textSlicer`, or `advancedSlicerVisual`** — the mode property only applies to `slicer`.

---

## slicer — Classic Slicer

### Dropdown (default)
```json
{
  "visualType": "slicer",
  "x": 20, "y": 650, "width": 200, "height": 44,
  "slicerMode": "Dropdown",
  "title": "Year",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Date[Year]", "type": "column" }] }
  ]
}
```

### Basic (expanded list)
```json
{
  "visualType": "slicer",
  "x": 20, "y": 650, "width": 200, "height": 150,
  "slicerMode": "Basic",
  "title": "Region",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Store[Region]", "type": "column" }] }
  ]
}
```

**PBIR visualObjects:**
- Dropdown → `data[mode='Dropdown']` + `selection[strictSingleSelect=true]`
- Basic → `data[mode='Basic']` only
- DO NOT add `isInvertedSelectionMode`, `selectAllCheckboxEnabled`, or `singleSelect`

---

## listSlicer — Always-Expanded Checkbox List

No `slicerMode` needed. No `visualObjects` — the visual is always in list/checkbox mode.

```json
{
  "visualType": "listSlicer",
  "x": 20, "y": 60, "width": 200, "height": 200,
  "title": "Segment",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "financials[Segment]", "type": "column" }] }
  ]
}
```

Use when: the user wants an always-visible checkbox list without a collapse/expand toggle.

---

## textSlicer — Text Search Box

Free-text search filter. No `slicerMode`, no `visualObjects`.

```json
{
  "visualType": "textSlicer",
  "x": 20, "y": 60, "width": 300, "height": 44,
  "title": "Search Products",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Product[Name]", "type": "column" }] }
  ]
}
```

Use when: the user wants to type to search/filter by a text column.

---

## advancedSlicerVisual — Range / Between Slicer

Supports between, less-than, greater-than operations. Best for numeric or date ranges.

```json
{
  "visualType": "advancedSlicerVisual",
  "x": 20, "y": 60, "width": 300, "height": 80,
  "title": "Sales Range",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Sales[Amount]", "type": "aggregation", "aggregation": "Sum" }] }
  ]
}
```

Use when: the user wants a "between" / slider-style filter.

---

## All slicer types — common rules

- Bucket is always **`Values`** (never `Category` or `Fields`)
- Default size: **w=168, h=65** (auto-applied if not specified)
- For `listSlicer`/`textSlicer`/`advancedSlicerVisual` allow more height: h=120–200

### Inline formatting (all types)
```json
{
  "containerFormat": [
    { "category": "background", "properties": { "show": true, "color": "#F8F9FA", "transparency": 0 } },
    { "category": "border",     "properties": { "show": true, "color": "#D1D5DB", "radius": 4 } },
    { "category": "visualHeader", "properties": { "show": false } }
  ]
}
```

### Horizontal slicer row (mixed types)
```json
[
  { "visualType": "slicer",    "x": 10,  "y": 650, "w": 180, "h": 44, "slicerMode": "Dropdown", "title": "Year" },
  { "visualType": "slicer",    "x": 200, "y": 650, "w": 180, "h": 44, "slicerMode": "Dropdown", "title": "Quarter" },
  { "visualType": "textSlicer","x": 390, "y": 650, "w": 240, "h": 44, "title": "Search Product" },
  { "visualType": "listSlicer","x": 640, "y": 620, "w": 200, "h": 90, "title": "Segment" }
]
```

---

## update_visual_bindings for any slicer type

Always use `"bucket": "Values"`:
```json
{
  "pageId": "<id>",
  "visualId": "<id>",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Product[Category]", "type": "column" }] }
  ]
}
```

---

## Choosing the right slicer

| Scenario | Use |
|---|---|
| Date picker / year selector | `slicer` Dropdown |
| Multi-select from list (e.g. regions) | `slicer` Basic or `listSlicer` |
| Search/filter by name | `textSlicer` |
| Numeric range (min/max slider) | `advancedSlicerVisual` |
| Date range (between two dates) | `advancedSlicerVisual` |
| Always visible compact list | `listSlicer` |
