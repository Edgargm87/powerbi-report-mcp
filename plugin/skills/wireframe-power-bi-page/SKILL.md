---
name: wireframe-power-bi-page
description: Use when planning the layout of a Power BI report page. Triggers on phrases like "wireframe a page", "layout for a dashboard", "where should I put the visuals", "design the page layout", "how should I arrange these visuals". Covers canvas geometry (1280x720), 5 validated layouts, the layout_grid tool, spacing math.
---

# Wireframe a Power BI Page

Power BI report pages have hard geometric constraints. Get the math wrong and the wireframe-validator rejects every visual. Get it right once via `layout_grid` and the server handles the math for you.

## Canvas constants (1280 x 720, 16:9, FitToPage)

- **Page margins**: 15px left, 15px right, 6px bottom, 0 top.
- **Usable content width**: 1250px (1280 - 15 - 15).
- **Usable content height**: 714px (720 - 6).
- **Gap between visuals**: 5px horizontal and vertical.
- **Banner** (page title): full-width at `x:0, y:0, w:1280, h:52` — exempt from side margins.
- **First content row** starts at `y:57` (banner 52 + gap 5).
- **Last row bottom edge** must be `<= 714`.

The validator refuses any non-banner visual at `x<15`, `right>1265`, or `bottom>714`. If you hand-compute coordinates and get one margin wrong, every visual on the page fails.

## Preferred path: `layout_grid`

For any new page with multiple visuals, call `layout_grid` instead of computing pixels. You declare the grid shape; the server returns x/y/w/h per cell, guaranteed valid.

```jsonc
{
  "pageId": "summary",
  "rows": 2,
  "cols": 3,
  "reserveBannerRow": false,
  "cells": [
    { "row": 0, "col": 0, "visualType": "card", "title": "Revenue" },
    { "row": 0, "col": 1, "visualType": "card", "title": "Margin" },
    { "row": 0, "col": 2, "visualType": "card", "title": "Orders" },
    { "row": 1, "col": 0, "visualType": "columnChart", "title": "By Region" },
    { "row": 1, "col": 1, "visualType": "lineChart",   "title": "Trend" },
    { "row": 1, "col": 2, "visualType": "pieChart",    "title": "Mix" }
  ],
  "planOnly": true
}
```

`rowSpan`/`colSpan` are supported. `reserveBannerRow:true` starts the grid at y:57 so a separately-added banner shape sits above.

Two modes:
- **`planOnly:true`** (default): returns the plan without writing. Sanity-check column widths and spans.
- **`planOnly:false`**: validates bindings and layout, then writes every cell as a visual in one call. Fails fast — no partial writes.

## The 5 validated layouts

1. **Dashboard** — banner + 2x2 content grid.
2. **Analysis** — hero visual + sidebar.
3. **KPI Summary** — 5-card strip at top + full-width chart below (use `visualType:"card"` for the KPIs, NOT the `kpi` visual — see report-design skill).
4. **Sidebar Nav** — narrow left column for slicers, wide right area for content.
5. **3x3 Grid** — for monitoring dashboards with many small tiles.

## Quick checks before placing anything

1. Count the visuals. If >12-15, you have too many for one page — split it.
2. Pick a layout from the 5 above. Don't invent a new one.
3. Use `layout_grid` planOnly first. Read back the column widths. Then `planOnly:false` to write.
4. If you're adding to an existing page (not building from scratch), inspect via `list_pages({includeVisuals:true})` and use `move_visual` for tweaks rather than recomputing the grid.

For full layout patterns, the spacing formula derivation, batch-creation templates, and the wireframe-validator's exact rules, ask the MCP: `guide("wireframes")`.
