<!-- mirrored from skills/wireframes.md at v0.9.6 (08eda17) -->

<!-- doc-version: 2.1 | Last updated: 2026-04-15 -->
<!-- summary: Canvas math (1280×720, 20px margins, 5px gaps, max bottom y=714), the 5 validated layouts, pbir_layout_grid patterns. Read before placing any visual. -->
# Skill: Wireframes — Report Layout Patterns

All layouts use canvas **1280 x 720** (16:9), `displayOption: "FitToPage"`.

**Rules (MUST follow):**
- Page margins: **15px** left, **15px** right, **6px** bottom (top 0).
- Usable content width: **1250px** (1280 - 15 - 15).
- Usable content height: **714px** (720 - 6) — the bottom 6px is breathing room.
- Gap between visuals: **5px** horizontal and vertical.
- Page title banner: **x:0, y:0, width:1280, height:52** (exempt from margins).
- First content row starts at **y:57** (banner 52 + gap 5).
- Last row bottom edge must be **≤ 714**.
- Every layout in this file has been validated against
  `src/wireframe-validator.ts` — run
  `node scripts/test-wireframe-validator.js` to verify.

> **Why this matters:** The validator refuses any non-banner visual at x<15,
> with right-edge > 1265, or bottom-edge > 714. If you copy numbers from
> memory and get the margin wrong, every visual on the page fails margin
> and overlap checks. Prefer the validated layouts below, or compute widths
> from the spacing formula and re-verify with the validator.

---

## Preferred path: `pbir_layout_grid`

When you're building a **fresh page from scratch** with multiple visuals,
call `pbir_layout_grid` instead of hand-computing pixel coordinates for each
`pbir_add_visual`. The server owns the margin/gap/remainder math — the LLM just
declares the grid shape and which cell each visual goes in.

```jsonc
// 2×3 dashboard (six cards + charts)
{
  "pageId": "summary",
  "rows": 2,
  "cols": 3,
  "reserveBannerRow": false,   // true if you want a banner at y:0
  "cells": [
    { "row": 0, "col": 0, "visualType": "card", "title": "Revenue" },
    { "row": 0, "col": 1, "visualType": "card", "title": "Margin" },
    { "row": 0, "col": 2, "visualType": "card", "title": "Orders" },
    { "row": 1, "col": 0, "visualType": "columnChart", "title": "By Region" },
    { "row": 1, "col": 1, "visualType": "lineChart",   "title": "Trend" },
    { "row": 1, "col": 2, "visualType": "pieChart",    "title": "Mix" }
  ],
  "planOnly": true              // Slice 2 default — returns x/y/w/h plan
}
```

Returns a plan with exact `x/y/w/h` per cell plus a `cellGeometry` block so
you can see the column widths (e.g. `[414, 413, 413]` for a 3-col grid).
Every returned rectangle is guaranteed to pass strict wireframe validation.

**Three worked examples:**

1. **Banner + 2×2 content grid** — banner at `(0,0,1280,52)` via `pbir_add_visual`,
   then `pbir_layout_grid` with `rows:2, cols:2, reserveBannerRow:true` for the
   four content visuals (grid starts at y=57, heights sum to 657).
2. **Hero + sidebar** — `rows:1, cols:3` with one cell at `(0,0,colSpan:2)`
   for the wide hero and another at `(0,2)` for the sidebar card.
3. **5-KPI strip + chart row** — `rows:2, cols:5`. Five cards in row 0, then
   one cell at `(1,0,colSpan:5)` for a full-width chart below. The five
   "KPIs" are `visualType: "card"` with one measure each, **not** the
   `kpi` visual — see `pbir_guide("report-design")` §"KPI Card Pattern".

`rowSpan`/`colSpan` are supported; `reserveBannerRow:true` starts the grid
at `y:57` so the banner shape (added separately via `pbir_add_visual`) sits
above it.

Two modes:
- **`planOnly:true`** (default) — returns the plan without writing. Use this
  first when you're unsure of the grid shape; the response echoes the
  computed numbers so you can sanity-check the column widths and spans.
- **`planOnly:false`** — validates bindings + layout, then writes every cell
  as a visual in one call. Same path `pbir_add_visual` uses, so formatting,
  bindings, slicers all behave identically. Fails fast with structured
  errors if anything's off — no partial writes.

## Validating an existing page: `pbir_validate_wireframe`

After hand-edits or to audit an inherited report, call
`pbir_validate_wireframe({ pageId? })` (omit `pageId` to auto-resolve when
there's only one page) or `pbir_validate_wireframe({ scope: "report" })` to
check every page at once. Returns the same structured `WireframeReport`
(errors + warnings + stats) the unit tests use — read-only, no writes.

---

---

## Spacing Formula

For N equal-width visuals in a row:

```
visual_width = (1250 - (N - 1) * 5) / N
```

| Visuals in row | Each width            | Gap total | x positions                          |
|----------------|-----------------------|-----------|--------------------------------------|
| 1              | 1250                  | 0         | 15                                   |
| 2              | 622 / 623             | 5         | 15, 642                              |
| 3              | 413 / 413 / 414       | 10        | 15, 433, 851                         |
| 4              | 308 / 308 / 308 / 311 | 15        | 15, 328, 641, 954                    |
| 5              | 246                   | 20        | 15, 266, 517, 768, 1019              |
| 6              | 204 / 204 / 204 / 204 / 204 / 205 | 25 | 15, 224, 433, 642, 851, 1060 |

For unequal splits:
- 2/3 + 1/3: `wider = 830, narrow = 415` (left x=15, right x=850)
- 1/3 + 2/3: `narrow = 415, wider = 830` (left x=15, right x=435)
- 1/2 + 1/2: `622 / 623`               (left x=15, right x=642)

> When a row's width doesn't divide cleanly, round **down** on all but the
> last visual and put the remainder on the last one so the right edge lands
> on **1265** (`1280 - 15`).

---

## Layout A — Dashboard (5 KPIs, 2 Charts, 3 Details)

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52  #1B2A4A                                       | y:0
+--[15px margin]------------------------------------------------[15px]--+
|  CARD1    |5| CARD2    |5| CARD3    |5| CARD4    |5| CARD5          | y:57
|  246x90       246x90       246x90       246x90       246x90          |
+-----------------------------------------------------------------------+
|  CHART-LEFT                |5| CHART-RIGHT                           | y:152
|  622x280                       623x280                               |
+-----------------------------------------------------------------------+
|  DETAIL-1       |5| DETAIL-2       |5| DETAIL-3                     | y:437
|  413x277            413x277            414x277                       |
+-----------------------------------------------------------------------+
                                                                   y:714
```

**Visuals:** 11  |  **Coverage:** 94.3%  |  **Bottom:** 714

| Visual      | x    | y    | width | height | z     |
|-------------|------|------|-------|--------|-------|
| Banner      | 0    | 0    | 1280  | 52     | 0     |
| Card 1      | 15   | 57   | 246   | 90     | 1000  |
| Card 2      | 266  | 57   | 246   | 90     | 2000  |
| Card 3      | 517  | 57   | 246   | 90     | 3000  |
| Card 4      | 768  | 57   | 246   | 90     | 4000  |
| Card 5      | 1019 | 57   | 246   | 90     | 5000  |
| Chart Left  | 15   | 152  | 622   | 280    | 6000  |
| Chart Right | 642  | 152  | 623   | 280    | 7000  |
| Detail 1    | 15   | 437  | 413   | 277    | 8000  |
| Detail 2    | 433  | 437  | 413   | 277    | 9000  |
| Detail 3    | 851  | 437  | 414   | 277    | 10000 |

---

## Layout B — Analysis (Chart + KPI Sidebar, Full-Width Table)

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52                                                | y:0
+--[15px margin]------------------------------------------------[15px]--+
|  SLICER-1           |5| SLICER-2           |5| SLICER-3             | y:57
|  413x60                 413x60                 414x60                |
+-----------------------------------------------------------------------+
|  MAIN CHART (2/3 width)         |5| KPI-1               415x93     | y:122
|  830x380                           KPI-2               415x93      |
|                                    KPI-3               415x93      |
|                                    KPI-4               415x86      |
+-----------------------------------------------------------------------+
|  TABLE (full width) 1250x207                                         | y:507
+-----------------------------------------------------------------------+
                                                                   y:714
```

**Visuals:** 10  |  **Coverage:** 94.1%  |  **Bottom:** 714

> **Slicer heights:** the 60px rows here match the slicer house default
> (see skills/slicers.md). Do NOT shrink slicers below `height: 44` — the
> dropdown chevron clips. The write-time guard in `createAndSaveVisual`
> auto-bumps `height < 44` to 44 for all 4 slicer types, but pass `60`
> explicitly so the intent is visible.

| Visual      | x    | y    | width | height | z     |
|-------------|------|------|-------|--------|-------|
| Banner      | 0    | 0    | 1280  | 52     | 0     |
| Slicer 1    | 15   | 57   | 413   | 60     | 1000  |
| Slicer 2    | 433  | 57   | 413   | 60     | 2000  |
| Slicer 3    | 851  | 57   | 414   | 60     | 3000  |
| Main Chart  | 15   | 122  | 830   | 380    | 4000  |
| KPI 1       | 850  | 122  | 415   | 93     | 5000  |
| KPI 2       | 850  | 220  | 415   | 93     | 6000  |
| KPI 3       | 850  | 318  | 415   | 93     | 7000  |
| KPI 4       | 850  | 416  | 415   | 86     | 8000  |
| Table       | 15   | 507  | 1250  | 207    | 9000  |

KPI stack bottom: `122 + 93 + 5 + 93 + 5 + 93 + 5 + 86 = 502`, matches chart bottom (`122 + 380 = 502`). Table ends at `507 + 207 = 714` — the canvas floor.

---

## Layout C — KPI Summary (6 Cards, Wide Chart)

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52                                                | y:0
+--[15px margin]------------------------------------------------[15px]--+
|  CARD-1         |5| CARD-2         |5| CARD-3                        | y:57
|  413x120            413x120            414x120                       |
+-----------------------------------------------------------------------+
|  CARD-4         |5| CARD-5         |5| CARD-6                        | y:182
|  413x120            413x120            414x120                       |
+-----------------------------------------------------------------------+
|  CHART (full width) 1250x407                                         | y:307
+-----------------------------------------------------------------------+
                                                                   y:714
```

**Visuals:** 8  |  **Coverage:** 94.7%  |  **Bottom:** 714

| Visual  | x    | y    | width | height | z    |
|---------|------|------|-------|--------|------|
| Banner  | 0    | 0    | 1280  | 52     | 0    |
| Card 1  | 15   | 57   | 413   | 120    | 1000 |
| Card 2  | 433  | 57   | 413   | 120    | 2000 |
| Card 3  | 851  | 57   | 414   | 120    | 3000 |
| Card 4  | 15   | 182  | 413   | 120    | 4000 |
| Card 5  | 433  | 182  | 413   | 120    | 5000 |
| Card 6  | 851  | 182  | 414   | 120    | 6000 |
| Chart   | 15   | 307  | 1250  | 407    | 7000 |

Columns align across rows: 15 / 433 / 851.

---

## Layout D — Sidebar Nav (160px Rail + KPI Row + 2 Charts + Table)

Content area starts at **x:180** (15 margin + 160 rail + 5 gap).
Content width = **1085px** (1280 - 180 - 15).

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52                                                | y:0
+-----------------------------------------------------------------------+
|  NAV  |5| KPI1  |5| KPI2  |5| KPI3  |5| KPI4                        | y:57
|  160  |  267x90    268x90    267x90    268x90                       |
|  x    +----------------------------------------------------------+  |
|  657  |  CHART-LEFT 540x280      |5| CHART-RIGHT 540x280          | y:152
|       +----------------------------------------------------------+  |
|       |  DETAIL TABLE 1085x277                                    | y:437
|       +----------------------------------------------------------+  |
+-----------------------------------------------------------------------+
                                                                   y:714
```

**Visuals:** 9  |  **Coverage:** 94.5%  |  **Bottom:** 714

| Visual      | x    | y    | width | height | z    |
|-------------|------|------|-------|--------|------|
| Banner      | 0    | 0    | 1280  | 52     | 0    |
| Nav Rail    | 15   | 57   | 160   | 657    | 1000 |
| KPI 1       | 180  | 57   | 267   | 90     | 2000 |
| KPI 2       | 452  | 57   | 268   | 90     | 3000 |
| KPI 3       | 725  | 57   | 267   | 90     | 4000 |
| KPI 4       | 997  | 57   | 268   | 90     | 5000 |
| Chart Left  | 180  | 152  | 540   | 280    | 6000 |
| Chart Right | 725  | 152  | 540   | 280    | 7000 |
| Detail      | 180  | 437  | 1085  | 277    | 8000 |

Content-area KPIs: `(1085 - 3*5) / 4 = 267.5` → 267 / 268 / 267 / 268.
Content charts: `(1085 - 5) / 2 = 540`.

---

## Layout E — 3x3 Tile Grid (9 Equal Tiles)

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52                                                | y:0
+-----------------------------------------------------------------------+
|  TILE 1    |5| TILE 2    |5| TILE 3                                  | y:57
|  413x215       413x215       414x215                                 |
+-----------------------------------------------------------------------+
|  TILE 4    |5| TILE 5    |5| TILE 6                                  | y:277
|  413x215       413x215       414x215                                 |
+-----------------------------------------------------------------------+
|  TILE 7    |5| TILE 8    |5| TILE 9                                  | y:497
|  413x215       413x215       414x215                                 |
+-----------------------------------------------------------------------+
                                                                   y:712
```

**Visuals:** 10  |  **Coverage:** 94.0%  |  **Bottom:** 712

| Visual | x    | y    | width | height | z     |
|--------|------|------|-------|--------|-------|
| Banner | 0    | 0    | 1280  | 52     | 0     |
| Tile 1 | 15   | 57   | 413   | 215    | 1000  |
| Tile 2 | 433  | 57   | 413   | 215    | 2000  |
| Tile 3 | 851  | 57   | 414   | 215    | 3000  |
| Tile 4 | 15   | 277  | 413   | 215    | 4000  |
| Tile 5 | 433  | 277  | 413   | 215    | 5000  |
| Tile 6 | 851  | 277  | 414   | 215    | 6000  |
| Tile 7 | 15   | 497  | 413   | 215    | 7000  |
| Tile 8 | 433  | 497  | 413   | 215    | 8000  |
| Tile 9 | 851  | 497  | 414   | 215    | 9000  |

Column alignment across rows: 15 / 433 / 851.
Row gaps: `57+215+5 = 277`, `277+215+5 = 497`, `497+215 = 712` (leaves 8px below > 6px min).

---

## Common Mistakes (and How the Validator Catches Them)

| Mistake                                             | Validator error      |
|-----------------------------------------------------|----------------------|
| Rounded up width (e.g. 247x5 cards -> right edge 1270) | `RIGHT_MARGIN`       |
| 10px gap from an older skill doc                    | `WRONG_GAP_H` / `V`  |
| Non-banner visual at x=0 (full page width)          | `LEFT_MARGIN`        |
| Forgot to set x/y -> visual lands at (0,0)          | `SILENT_DEFAULT`     |
| Two visuals with overlapping bounding boxes         | `OVERLAP`            |
| Row pushes past y:714 (6px bottom margin)           | `BOTTOM_MARGIN`      |
| Row pushes past y:720 (off the canvas)              | `OUT_OF_BOUNDS`      |
| Width/height <= 0                                   | `NEGATIVE_DIMENSION` |

Run the validator from Node on any layout:

```js
const { validateWireframe, formatReport } = require("./dist/wireframe-validator");
const visuals = [ /* { id, visualType, x, y, width, height } ... */ ];
console.log(formatReport(validateWireframe(visuals)));
```

Or import from TypeScript:

```ts
import { validateWireframe, formatReport } from "./wireframe-validator";
```

---

## Placement Procedure

When building a page, follow this order:

1. Create the page at **1280 x 720**.
2. Place the banner at **(0, 0, 1280, 52)** as the first visual.
3. Decide how many rows the content needs and how many visuals per row.
4. Compute widths via the spacing formula: `(1250 - (N-1)*5) / N`.
5. Compute y top-down: each row `y = previous row y + previous row height + 5`.
6. Compute x left-to-right: first visual `x = 15`, next `x = prev x + prev width + 5`.
7. Verify last visual right edge = **1265** (`1280 - 15`).
8. Verify last row bottom <= **714** (`720 - 6` bottom margin).
9. Run the validator. Fix any reported errors before committing.

---

## Batch-Creation Template

```json
{
  "pageId": "<page-id>",
  "visuals": [
    { "visualType": "shape", "x": 0, "y": 0, "width": 1280, "height": 52,
      "shapeType": "rectangle", "fillColor": "#1B2A4A",
      "textContent": "Page Title", "textColor": "#FFFFFF",
      "textBold": true, "textSize": 20 },

    { "visualType": "card", "x": 15,  "y": 57, "width": 246, "height": 90 },
    { "visualType": "card", "x": 266, "y": 57, "width": 246, "height": 90 },
    { "visualType": "card", "x": 517, "y": 57, "width": 246, "height": 90 },
    { "visualType": "card", "x": 768, "y": 57, "width": 246, "height": 90 },
    { "visualType": "card", "x": 1019,"y": 57, "width": 246, "height": 90 }
  ]
}
```

Rules:
- Always include explicit `x`, `y`, `width`, `height` — never rely on defaults.
- Banner first, data visuals next. Z-order auto-increments by add order.
- If a row requires unequal widths, round **down** on all but the last visual
  and give the remainder to the last one (so the right edge lands on 1265).

---

## Z-Order Convention

| Layer          | Z-order range | Examples                        |
|----------------|---------------|---------------------------------|
| Base visuals   | 0 - 999       | Banner, background shapes       |
| Content visuals| 1000 - 9999   | Cards, charts, tables, slicers  |
| Overlays       | 10000+        | Buttons, bookmarks, annotations |

The banner is always z-order 0. Content visuals increment in reading order
(top-left to bottom-right).
