<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
<!-- summary: slicer/listSlicer/textSlicer/advancedSlicerVisual — orientation, selection mode, header/items styling, multiSelect, slicerMode. Read when adding filter controls. -->
# Skill: Slicers — Filters & Selection Controls

## The 4 Slicer Visual Types

Power BI has four distinct slicer visual types. Each is a **separate visualType** — they are NOT modes of each other.

| visualType | What it is | Use for |
|---|---|---|
| `slicer` | Classic slicer — supports Dropdown or Basic (list) mode | Most common — date, text, numeric columns |
| `listSlicer` | Always-expanded checkbox list | Multi-select from a short list |
| `textSlicer` | Text search / contains filter box | Free-text search on a column |
| `advancedSlicerVisual` | Range slicer with Between / less-than / greater-than | Numeric ranges, date ranges |

**Bucket is always `Values`** for every slicer type — never `Category` or `Fields`.

---

## `slicer` — Classic Slicer

The only slicer type that has a **mode** (Dropdown vs Basic). Set via `slicerMode`. Both modes also support a single-select / multi-select toggle via `multiSelect`.

### Dropdown (default) — single-select
```json
{
  "visualType": "slicer",
  "slicerMode": "Dropdown",
  "x": 20, "y": 650, "width": 200, "height": 44,
  "title": "Year",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Date[Year]", "type": "column" }] }
  ]
}
```

PBI default: Dropdown mode is single-select (radio). The `pbir_add_visual` builder writes `objects.data[0].properties.mode = 'Dropdown'` and `objects.selection[0].properties.strictSingleSelect = true`.

### Dropdown — multi-select
```json
{
  "visualType": "slicer",
  "slicerMode": "Dropdown",
  "multiSelect": true,
  "x": 20, "y": 650, "width": 200, "height": 44,
  "title": "Region",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Store[Region]", "type": "column" }] }
  ]
}
```

`multiSelect: true` writes `objects.selection[0].properties.singleSelect = false` (note the **inverted** name — PBIR stores the inverse boolean).

### Basic (expanded list) — multi-select default
```json
{
  "visualType": "slicer",
  "slicerMode": "Basic",
  "x": 20, "y": 650, "width": 200, "height": 150,
  "title": "Segment",
  "bindings": [
    { "bucket": "Values", "fields": [{ "field": "Sales[Segment]", "type": "column" }] }
  ]
}
```

Basic is multi-select by PBI default — omit `multiSelect`. To force single-select on Basic, pass `multiSelect: false`.

---

## `listSlicer` — Always-Expanded Checkbox List

No `slicerMode` — list mode is intrinsic. Multi-select by PBI default; pass `multiSelect: false` to force single-select.

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

Use when: the user wants an always-visible checkbox list without the Dropdown collapse/expand toggle.

---

## `textSlicer` — Text Search Box

Free-text contains-filter. No `slicerMode`, no `multiSelect` — it's a text input, not a selector.

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

## `advancedSlicerVisual` — Range / Between Slicer

Supports between, less-than, greater-than operations. Best for numeric or date ranges. No `slicerMode`, no `multiSelect`.

```json
{
  "visualType": "advancedSlicerVisual",
  "x": 20, "y": 60, "width": 300, "height": 80,
  "title": "Sales Range",
  "bindings": [
    {
      "bucket": "Values",
      "fields": [{ "field": "Sales[Amount]", "type": "aggregation", "aggregation": "Sum" }]
    }
  ]
}
```

Use when: the user wants a "between" / slider-style filter on a measure or date column.

---

## Inspecting a slicer's mode and selection state

`pbir_get_visual` slim mode (default) surfaces both fields for any slicer type:

```json
// pbir_get_visual({ pageId, visualId })
{
  "id": "...",
  "type": "slicer",
  "x": 20, "y": 650, "w": 200, "h": 44,
  "slicerMode": "Dropdown",      // slicer type only
  "multiSelect": false           // any slicer type
}
```

Detection rules:

| PBIR property | Result |
|---|---|
| `objects.selection[0].properties.singleSelect.expr.Literal.Value === "false"` | `multiSelect: true` |
| `... === "true"` | `multiSelect: false` |
| Property absent + `slicer` Dropdown | `multiSelect: false` (PBI default) |
| Property absent + `slicer` Basic | `multiSelect: true` (PBI default) |
| Property absent + `listSlicer` | `multiSelect: true` (PBI default) |

`slicerMode` is read from `objects.data[0].properties.mode.expr.Literal.Value` and defaults to `"Dropdown"` for the standard `slicer` type when absent.

---

## All slicer types — common rules

- Bucket is always **`Values`** (never `Category` or `Fields`)
- Slicer items default to `textSize: 8`, Segoe UI (set by `createAndSaveVisual`)

### House defaults (applied automatically by `pbir_add_visual` for all 4 slicer types)

| Property | Default | Rationale |
|---|---|---|
| `width` | **184** | Fits Segoe UI 8pt category labels on a single row without truncation |
| `height` | **60** | Fits a single-row dropdown slicer + 5px gap to next row |
| `title.show` | **false** | Slicers self-identify via the field/header; a big visual title duplicates the slicer header |
| `header.show` | **true** | The slicer header (column name + clear button) is on by default |
| `header.textSize` | **8** | Matches house typography |
| `items.textSize` | **8** | Matches house typography |

Override rules:
- If the user passes `title: "..."` on `pbir_add_visual`, **title.show stays on** (explicit title wins over the slicer-off default).
- Any `containerFormat`/`visualFormat` entries override the house defaults — inline formatting always wins over the bundled defaults, which in turn win over the theme.
- For Basic/listSlicer with a long list, pass `height: 120–200` explicitly — 60 is only right for single-row Dropdowns.

### DO / DON'T for LLM callers

**DON'T pass `title: "..."` on slicers.** The header already shows the column name — a title on top duplicates it and wastes ~20px of vertical space. Leave `title` off and let `header.show=true` (the default) identify the slicer. If the user explicitly asks for a labelled slicer, use `containerFormat` with `title: { show: true, text: "..." }` so the intent is visible in the spec.

**DON'T pass `height < 44`.** Power BI clips a dropdown slicer's chevron/control under ~44px and the visual renders broken. The write-time guard in `createAndSaveVisual` auto-bumps any `height < 44` up to 44 for all 4 slicer types — but you should pass `60` (the house default) or higher so the intent is explicit and the caller doesn't rely on the auto-correct.

**DON'T cram slicers into a 40px filter-bar strip.** If you need a top-of-page filter row, use `y: <row_top>`, `height: 60`, and space 3–4 slicers horizontally at `width: 184` each. The strip then occupies a single 60px row, not a clipped 40px one.

### Inline formatting (all types)
```json
{
  "containerFormat": [
    { "category": "background",   "properties": { "show": true, "color": "#F8F9FA", "transparency": 0 } },
    { "category": "border",       "properties": { "show": true, "color": "#D1D5DB", "radius": 4 } },
    { "category": "visualHeader", "properties": { "show": false } }
  ],
  "visualFormat": [
    { "category": "items",  "properties": { "fontSize": 9 } },
    { "category": "header", "properties": { "fontSize": 9 } }
  ]
}
```

### Horizontal slicer row (mixed types) — batch mode
```json
{
  "pageId": "<id>",
  "visuals": [
    { "visualType": "slicer",     "x": 10,  "y": 650, "width": 180, "height": 44,
      "slicerMode": "Dropdown", "title": "Year",
      "bindings": [{ "bucket": "Values", "fields": [{ "field": "Date[Year]", "type": "column" }] }] },
    { "visualType": "slicer",     "x": 200, "y": 650, "width": 180, "height": 44,
      "slicerMode": "Dropdown", "title": "Quarter",
      "bindings": [{ "bucket": "Values", "fields": [{ "field": "Date[Quarter]", "type": "column" }] }] },
    { "visualType": "textSlicer", "x": 390, "y": 650, "width": 240, "height": 44,
      "title": "Search Product",
      "bindings": [{ "bucket": "Values", "fields": [{ "field": "Product[Name]", "type": "column" }] }] },
    { "visualType": "listSlicer", "x": 640, "y": 620, "width": 200, "height": 90,
      "title": "Segment", "multiSelect": true,
      "bindings": [{ "bucket": "Values", "fields": [{ "field": "Sales[Segment]", "type": "column" }] }] }
  ]
}
```

---

## Updating bindings on an existing slicer

`pbir_update_visual_bindings` works the same for any slicer type — bucket is always `Values`:

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
| Multi-select from short list (regions, segments) | `slicer` Basic, or `listSlicer` |
| Multi-select with Dropdown UX | `slicer` Dropdown + `multiSelect: true` |
| Search/filter by name | `textSlicer` |
| Numeric range (min/max slider) | `advancedSlicerVisual` |
| Date range (between two dates) | `advancedSlicerVisual` |
| Always visible compact list, no toggle | `listSlicer` |

---

## Common pitfalls

- ❌ Don't set `slicerMode` on `listSlicer`, `textSlicer`, or `advancedSlicerVisual` — only `slicer` has a mode
- ❌ Don't set `bucket: "Category"` on a slicer — always `Values`
- ❌ Don't try to write `singleSelect` literally as a boolean in `pbir_format_visual` — use `pbir_add_visual`'s `multiSelect` parameter (it handles the inversion and the PBIR wrapping)
- ❌ Don't forget that `singleSelect` in PBIR is the **inverse** of the user-facing "multi-select" toggle — `multiSelect: true` becomes `singleSelect: "false"` in the JSON
- ✅ Use `pbir_get_visual` slim mode to confirm both `slicerMode` and `multiSelect` after creating — both are surfaced for any slicer type
