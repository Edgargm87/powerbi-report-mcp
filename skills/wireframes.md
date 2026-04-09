<!-- doc-version: 1.0 | Last updated: 2026-04-09 -->
# Skill: Wireframes — Report Layout Patterns

All layouts use canvas **1280 × 720** (16:9), `displayOption: "FitToPage"`.
Standard margin: **10px** on all sides. Gap between elements: **10px**.
Z-order: create background shapes first (lower z), data visuals on top (higher z).

---

## Layout 1 — Basic Grid (3 rows)

```
┌──────────────────────────────────────┐
│  Card │  Card  │  Card  │  Card      │  y=10, h=140
├───────┴────────┼────────┴────────────┤
│   Left Half    │    Right Half       │  y=160, h=260
├────────────────┴────────────────────┤
│  Third   │  Third   │  Third        │  y=430, h=270
└──────────────────────────────────────┘
```

**Shapes:**
```
// 4 top cards (w=307 each, gap=10)
{ x:10,  y:10, w:307, h:140 }
{ x:327, y:10, w:307, h:140 }
{ x:644, y:10, w:307, h:140 }
{ x:961, y:10, w:307, h:140 }
// 2 halves
{ x:10,  y:160, w:625, h:260 }
{ x:645, y:160, w:625, h:260 }
// 3 thirds
{ x:10,  y:430, w:413, h:270 }
{ x:433, y:430, w:413, h:270 }
{ x:856, y:430, w:413, h:270 }
```

---

## Layout 2 — Classic Dashboard

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├──────┬──────┬──────┬────────────────┤
│ KPI  │ KPI  │ KPI  │ KPI            │  y=60, h=100
├──────┴──────┼──────┴────────────────┤
│  Chart L    │   Chart R             │  y=170, h=240
├──────┬──────┼──────┬────────────────┤
│ Chart│ Chart│       Chart           │  y=420, h=290
└──────┴──────┴──────┴────────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// 4 KPI cards
{ x:10,  y:60, w:300, h:100, z:2000 }
{ x:320, y:60, w:300, h:100, z:3000 }
{ x:630, y:60, w:300, h:100, z:4000 }
{ x:940, y:60, w:330, h:100, z:5000 }
// 2 mid charts
{ x:10,  y:170, w:625, h:240, z:6000 }
{ x:645, y:170, w:625, h:240, z:7000 }
// 3 bottom charts
{ x:10,  y:420, w:405, h:290, z:8000 }
{ x:425, y:420, w:405, h:290, z:9000 }
{ x:840, y:420, w:430, h:290, z:10000 }
```

---

## Layout 3 — Sidebar Layout

```
┌───┬──────────────────────────────────┐
│   │         HEADER BAR               │  y=10, h=40
│   ├──────┬──────┬──────┬─────────────┤
│ S │ Card │ Card │ Card │  Card       │  y=60, h=100
│ I ├──────┴──────┴──────┘             │
│ D │         Main Chart               │  y=170, h=540
│ E │                    ├─────────────┤
│ B │                    │  Mini       │  y=170, h=260
│ A │                    ├─────────────┤
│ R │                    │  Mini       │  y=440, h=270
└───┴────────────────────┴─────────────┘
```

**Shapes:**
```
// Left sidebar (full height)
{ x:10, y:10, w:160, h:700, z:1000 }
// Content header
{ x:180, y:10, w:1090, h:40, z:2000 }
// 4 top cards
{ x:180, y:60, w:260, h:100, z:3000 }
{ x:450, y:60, w:260, h:100, z:4000 }
{ x:720, y:60, w:260, h:100, z:5000 }
{ x:990, y:60, w:280, h:100, z:6000 }
// Large main chart
{ x:180, y:170, w:710, h:540, z:7000 }
// Right mini charts
{ x:900, y:170, w:370, h:260, z:8000 }
{ x:900, y:440, w:370, h:270, z:9000 }
```

---

## Layout 4 — Hero Layout

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├─────────────────────┬───────────────┤
│                     │  Top Right    │  y=60, h=140
│   HERO / MAIN       ├───────────────┤
│   (large featured)  │  Mid Right    │  y=210, h=140
│                     ├───────────────┤
│   x=10, w=750, h=470│  Bot Right    │  y=360, h=170
├──────────┬──────────┴───────────────┤
│  Strip 1 │  Strip 2  │  Strip 3     │  y=540, h=170
└──────────┴───────────┴──────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// Hero (big left)
{ x:10, y:60, w:750, h:470, z:2000 }
// Right stack (3 panels)
{ x:770, y:60,  w:500, h:140, z:3000 }
{ x:770, y:210, w:500, h:140, z:4000 }
{ x:770, y:360, w:500, h:170, z:5000 }
// Bottom strip (3 equal)
{ x:10,  y:540, w:400, h:170, z:6000 }
{ x:420, y:540, w:400, h:170, z:7000 }
{ x:830, y:540, w:440, h:170, z:8000 }
```

---

## Layout 5 — Magazine Z-Layout

Follows the eye's natural Z reading path: top-left → top-right → diagonal → bottom-left → bottom-right.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├─────────────────────┬───────┬───────┤
│                     │ Top R1│ Top R2│  y=60
│   BIG FEATURE       ├───────┼───────┤  h=300 (left)
│   (dominant visual) │ Mid R1│ Mid R2│  h=140+150 (right)
├──────────┬──────────┴───────┴───────┤
│ Bottom 1 │  Bottom 2  │  Bottom 3   │  y=370, h=340
└──────────┴────────────┴─────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// Big feature left
{ x:10, y:60, w:625, h:300, z:2000 }
// Right column top (2 side by side)
{ x:645, y:60,  w:305, h:140, z:3000 }
{ x:960, y:60,  w:310, h:140, z:4000 }
// Right column mid (2 side by side)
{ x:645, y:210, w:305, h:150, z:5000 }
{ x:960, y:210, w:310, h:150, z:6000 }
// Bottom 3
{ x:10,  y:370, w:405, h:340, z:7000 }
{ x:425, y:370, w:405, h:340, z:8000 }
{ x:840, y:370, w:430, h:340, z:9000 }
```

---

## Layout 6 — F-Layout

Mirrors how users scan dashboards: strong top row, then down the left.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├──────┬──────┬──────┬──────┬─────────┤
│ Card1│ Card2│ Card3│ Card4│  Card5  │  y=60, h=110  (5 equal cards)
├──────┴──────┴──────┴──┬───┴─────────┤
│   Wide Chart (left)   │  Chart R    │  y=180, h=230
├──────────────────┬────┴──┬──────────┤
│  Large Bottom L  │  sm  │  Tall R  │  y=420, h=290
│                  │  sm  │          │
└──────────────────┴──────┴──────────┘
```

**Shapes:**
```
// Header
{ x:10,   y:10, w:1260, h:40, z:1000 }
// 5 top cards
{ x:10,   y:60, w:238, h:110, z:2000 }
{ x:258,  y:60, w:238, h:110, z:3000 }
{ x:506,  y:60, w:238, h:110, z:4000 }
{ x:754,  y:60, w:238, h:110, z:5000 }
{ x:1002, y:60, w:268, h:110, z:6000 }
// Mid row
{ x:10,  y:180, w:840, h:230, z:7000 }
{ x:860, y:180, w:410, h:230, z:8000 }
// Bottom
{ x:10,  y:420, w:615, h:290, z:9000 }
{ x:635, y:420, w:300, h:135, z:10000 }
{ x:635, y:565, w:300, h:145, z:11000 }
{ x:945, y:420, w:325, h:290, z:12000 }
```

---

## Layout 7 — Hub and Spoke

Central focal chart surrounded by supporting context panels.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├────────┬──────────────────┬─────────┤
│ Spoke  │    Spoke Top     │  Spoke  │
│ Left   │   x=530, y=60    │  Right  │
│ Top    │   w=220, h=125   │  Top    │
│        ├──────────────────┤         │
│        │                  │         │
│        │   HUB (centre)   │         │
│        │  x=390, y=195    │         │
│        │  w=500, h=300    │         │
│        ├──────────────────┤         │
│ Spoke  │   Spoke Bottom   │  Spoke  │
│ Left   │   x=530, y=505   │  Right  │
│ Bottom │   w=220, h=165   │  Bottom │
└────────┴──────────────────┴─────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// Centre hub
{ x:390, y:195, w:500, h:300, z:2000 }
// Top spoke
{ x:530, y:60,  w:220, h:125, z:3000 }
// Left spokes
{ x:10,  y:110, w:300, h:160, z:4000 }
{ x:10,  y:440, w:300, h:175, z:6000 }
// Right spokes
{ x:970, y:110, w:300, h:160, z:5000 }
{ x:970, y:440, w:300, h:175, z:7000 }
// Bottom spoke
{ x:530, y:505, w:220, h:165, z:8000 }
```

---

## Layout 8 — KPI Banner + Body

Full-width KPI strip at top, charts below. Best for executive dashboards.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├──────┬──────┬──────┬──────┬─────────┤
│ KPI  │ KPI  │ KPI  │ KPI  │  KPI   │  y=60, h=120  (5 KPIs)
├──────┴──────┼──────┴──────┴─────────┤
│  Chart L    │    Chart R            │  y=190, h=240
├──────┬──────┼──────┬────────────────┤
│ Bot 1│ Bot 2│       Bot 3           │  y=440, h=270
└──────┴──────┴──────┴────────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// 5 KPI cards
{ x:10,   y:60, w:238, h:120, z:2000 }
{ x:258,  y:60, w:238, h:120, z:3000 }
{ x:506,  y:60, w:238, h:120, z:4000 }
{ x:754,  y:60, w:238, h:120, z:5000 }
{ x:1002, y:60, w:268, h:120, z:6000 }
// 2 mid charts
{ x:10,  y:190, w:625, h:240, z:7000 }
{ x:645, y:190, w:625, h:240, z:8000 }
// 3 bottom charts
{ x:10,  y:440, w:400, h:270, z:9000 }
{ x:420, y:440, w:400, h:270, z:10000 }
{ x:830, y:440, w:440, h:270, z:11000 }
```

---

## Layout 9 — Left Nav Sidebar

Persistent navigation rail on the left for multi-section reports.

```
┌───┬──────────────────────────────────┐
│   │         HEADER BAR               │  y=10, h=40
│ N ├──────┬──────┬──────┬─────────────┤
│ A │ Card │ Card │ Card │  Card       │  y=60, h=110
│ V ├──────┴──────┴──────┤             │
│   │                    │  Panel R1   │  y=180, h=260
│ R │  Main Content      ├─────────────┤
│ A │  x=180, y=180      │  Panel R2   │  y=450, h=270
│ I │  w=720, h=540      │             │
│ L │                    │             │
└───┴────────────────────┴─────────────┘
```

**Shapes:**
```
// Nav rail (full height)
{ x:10, y:10, w:160, h:700, z:1000 }
// Content header
{ x:180, y:10, w:1090, h:40, z:2000 }
// 4 top cards
{ x:180, y:60, w:255, h:110, z:3000 }
{ x:445, y:60, w:255, h:110, z:4000 }
{ x:710, y:60, w:255, h:110, z:5000 }
{ x:975, y:60, w:295, h:110, z:6000 }
// Main content
{ x:180, y:180, w:720, h:540, z:7000 }
// Right panels
{ x:910, y:180, w:360, h:260, z:8000 }
{ x:910, y:450, w:360, h:270, z:9000 }
```

---

## Layout 10 — Grid Tile Layout

Uniform 3×3 grid — each tile the same size, no hierarchy.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├───────────┬───────────┬─────────────┤
│  Tile 1   │  Tile 2   │   Tile 3   │  y=60, h=210
├───────────┼───────────┼─────────────┤
│  Tile 4   │  Tile 5   │   Tile 6   │  y=280, h=210
├───────────┼───────────┼─────────────┤
│  Tile 7   │  Tile 8   │   Tile 9   │  y=500, h=210
└───────────┴───────────┴─────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// Row 1 (y=60)
{ x:10,  y:60, w:413, h:210, z:2000 }
{ x:433, y:60, w:413, h:210, z:3000 }
{ x:856, y:60, w:414, h:210, z:4000 }
// Row 2 (y=280)
{ x:10,  y:280, w:413, h:210, z:5000 }
{ x:433, y:280, w:413, h:210, z:6000 }
{ x:856, y:280, w:414, h:210, z:7000 }
// Row 3 (y=500)
{ x:10,  y:500, w:413, h:210, z:8000 }
{ x:433, y:500, w:413, h:210, z:9000 }
{ x:856, y:500, w:414, h:210, z:10000 }
```

---

## Layout 11 — Top-Down Narrative

Tells a sequential story: title → metrics → main insight → supporting → footnote.

```
┌─────────────────────────────────────┐
│           HEADER BAR          y=10  │
├─────────────────────────────────────┤
│      TITLE / SUBTITLE BAR     y=60  │  h=55
├──────┬──────┬──────┬──────┬─────────┤
│ M1   │ M2   │ M3   │ M4   │  M5    │  y=125, h=90  (5 metrics)
├──────┴──────┴──────┴──────┴─────────┤
│         WIDE INSIGHT CHART    y=225  │  h=195
├──────────────────┬──────────────────┤
│   Detail Left    │  Detail Right    │  y=430, h=155
├──────────────────┴──────────────────┤
│         FOOTNOTE / CONTEXT    y=595  │  h=115
└─────────────────────────────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10,  w:1260, h:40,  z:1000 }
// Title bar
{ x:10, y:60,  w:1260, h:55,  z:2000 }
// 5 metric cards
{ x:10,   y:125, w:240, h:90, z:3000 }
{ x:260,  y:125, w:240, h:90, z:4000 }
{ x:510,  y:125, w:240, h:90, z:5000 }
{ x:760,  y:125, w:240, h:90, z:6000 }
{ x:1010, y:125, w:260, h:90, z:7000 }
// Wide chart
{ x:10, y:225, w:1260, h:195, z:8000 }
// 2 detail panels
{ x:10,  y:430, w:620, h:155, z:9000 }
{ x:640, y:430, w:630, h:155, z:10000 }
// Footnote strip
{ x:10, y:595, w:1260, h:115, z:11000 }
```

---

## Layout 12 — Master Detail

Left panel = master list / navigation. Right = detail view for selected item.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├──────────────┬──────────────────────┤
│ Master label │  Detail label        │  y=60, h=35
├──────────────┼──────────┬───────────┤
│              │ Detail   │ Detail    │  y=105, h=100
│  Master List │  Top L   │  Top R    │
│  x=10, y=105 ├──────────┴───────────┤
│  w=480, h=285│  Detail Wide         │  y=215, h=175
│              ├──────────┬───────────┤
├──────────────┤ Detail   │ Detail    │  y=400, h=310
│  Master Bot  │  Bot L   │  Bot R    │
│  x=10, y=400 │          │           │
│  w=480, h=310│          │           │
└──────────────┴──────────┴───────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// Section labels
{ x:10,  y:60, w:480, h:35, z:2000 }
{ x:500, y:60, w:770, h:35, z:5000 }
// Master panels
{ x:10, y:105, w:480, h:285, z:3000 }
{ x:10, y:400, w:480, h:310, z:4000 }
// Detail top (2 + wide)
{ x:500, y:105, w:375, h:100, z:6000 }
{ x:885, y:105, w:385, h:100, z:7000 }
{ x:500, y:215, w:770, h:175, z:8000 }
// Detail bottom (2)
{ x:500, y:400, w:375, h:310, z:9000 }
{ x:885, y:400, w:385, h:310, z:10000 }
```

---

## Layout 13 — Quadrant Layout

2×2 grid with section labels. Each quadrant represents a strategic axis.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├─────────────────┬───────────────────┤
│ [Label Q1 TL]  │ [Label Q2 TR]     │  y=60, h=30
├─────────────────┼───────────────────┤
│                 │                   │
│   Quadrant TL   │   Quadrant TR     │  y=100, h=290
│   x=10, w=625   │   x=645, w=625    │
│                 │                   │
├─────────────────┼───────────────────┤
│ [Label Q3 BL]  │ [Label Q4 BR]     │  y=400, h=30
├─────────────────┼───────────────────┤
│                 │                   │
│   Quadrant BL   │   Quadrant BR     │  y=440, h=270
│                 │                   │
└─────────────────┴───────────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// Top labels
{ x:10,  y:60, w:625, h:30, z:2000 }
{ x:645, y:60, w:625, h:30, z:4000 }
// Top quadrants
{ x:10,  y:100, w:625, h:290, z:3000 }
{ x:645, y:100, w:625, h:290, z:5000 }
// Bottom labels
{ x:10,  y:400, w:625, h:30, z:6000 }
{ x:645, y:400, w:625, h:30, z:8000 }
// Bottom quadrants
{ x:10,  y:440, w:625, h:270, z:7000 }
{ x:645, y:440, w:625, h:270, z:9000 }
```

---

## Layout 14 — Shneiderman (Overview + Detail)

Based on Shneiderman's mantra: *Overview first, zoom and filter, details on demand.*
Large overview left + filter controls right + drill-down panels bottom.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├───────────────────────┬─────────────┤
│                       │  Filter 1   │  y=60, h=70
│   OVERVIEW (large)    ├─────────────┤
│                       │  Filter 2   │  y=140, h=70
│   x=10, y=60          ├─────────────┤
│   w=840, h=340        │  Filter 3   │  y=220, h=70
│                       ├─────────────┤
│                       │  Filter 4   │  y=300, h=100
├──────────┬────────────┴─────────────┤
│ Detail 1 │  Detail 2  │  Detail 3   │  y=410, h=300
└──────────┴────────────┴─────────────┘
```

**Shapes:**
```
// Header
{ x:10, y:10,  w:1260, h:40, z:1000 }
// Overview
{ x:10, y:60,  w:840,  h:340, z:2000 }
// Right filters (4 stacked)
{ x:860, y:60,  w:410, h:70,  z:3000 }
{ x:860, y:140, w:410, h:70,  z:4000 }
{ x:860, y:220, w:410, h:70,  z:5000 }
{ x:860, y:300, w:410, h:100, z:6000 }
// Bottom detail panels
{ x:10,  y:410, w:400, h:300, z:7000 }
{ x:420, y:410, w:400, h:300, z:8000 }
{ x:830, y:410, w:440, h:300, z:9000 }
```

---

## Layout 15 — 3 Pillars

Three equal columns, each with: pillar label → KPI metric → body chart → footer detail.

```
┌─────────────────────────────────────┐
│           HEADER BAR                │  y=10, h=40
├──────────────┬──────────────┬───────┤
│  [Pillar 1]  │  [Pillar 2]  │ [P3] │  y=60, h=45   (labels)
├──────────────┼──────────────┼───────┤
│   KPI card   │   KPI card   │ KPI  │  y=115, h=100
├──────────────┼──────────────┼───────┤
│              │              │       │
│  Body Chart  │  Body Chart  │ Body │  y=225, h=225
│              │              │       │
├──────────────┼──────────────┼───────┤
│  Footer      │  Footer      │ Foot │  y=460, h=250
└──────────────┴──────────────┴───────┘
```

**Shapes:**
```
// Header
{ x:10, y:10, w:1260, h:40, z:1000 }
// Pillar labels
{ x:10,  y:60, w:410, h:45, z:2000 }
{ x:430, y:60, w:410, h:45, z:3000 }
{ x:850, y:60, w:420, h:45, z:4000 }
// KPI row
{ x:10,  y:115, w:410, h:100, z:5000 }
{ x:430, y:115, w:410, h:100, z:6000 }
{ x:850, y:115, w:420, h:100, z:7000 }
// Body
{ x:10,  y:225, w:410, h:225, z:8000 }
{ x:430, y:225, w:410, h:225, z:9000 }
{ x:850, y:225, w:420, h:225, z:10000 }
// Footer
{ x:10,  y:460, w:410, h:250, z:11000 }
{ x:430, y:460, w:410, h:250, z:12000 }
{ x:850, y:460, w:420, h:250, z:13000 }
```

---

## Wireframe Workflow

```
1. create_page (w:1280, h:720)
2. add_visual (batch) — all shapes in one call, background first (low z)
3. add_visual (batch) — slicers, cards, charts on top (higher z auto-increments)
4. set_report_theme — apply brand colours globally
5. apply_theme (optional) — per-page container overrides
```

### Creating shapes in batch mode
```json
{
  "pageId": "<id>",
  "visuals": [
    { "visualType": "shape", "x": 10, "y": 10, "width": 1260, "height": 40,
      "shapeType": "rectangle", "fillColor": "#1F3864" },
    { "visualType": "shape", "x": 10, "y": 60, "width": 300, "height": 100,
      "shapeType": "rectangle", "fillColor": "#FFFFFF",
      "textContent": "KPI 1", "textColor": "#1F3864", "textBold": true, "textSize": 10 },
    ...
  ]
}
```

---

## Quick Reference — Standard Measurements

| Element | x | y | w | h | Notes |
|---|---|---|---|---|---|
| Full-width header | 10 | 10 | 1260 | 40 | |
| Full-width title bar | 10 | 60 | 1260 | 55 | below header |
| Left sidebar (nav) | 10 | 10 | 160 | 700 | full height |
| Content header (with sidebar) | 180 | 10 | 1090 | 40 | |
| 4 KPI cards | 10/320/630/940 | 60 | 300/300/300/330 | 100 | |
| 5 KPI cards | 10/258/506/754/1002 | 60 | 238×4+268 | 120 | |
| 2 halves | 10/645 | — | 625/625 | — | |
| 3 thirds | 10/433/856 | — | 413/413/414 | — | |
| 3×3 tile | 10/433/856 | varies | 413/413/414 | 210 | |
| 2 columns (left nav) | 180/910 | — | 720/360 | — | |
| Bottom slicer | 10/240/460/680/900 | 660 | 200 | 44 | 5-slicer row |

## Z-order Convention

- **1000** — background panels, header bar
- **2000–5000** — content area shapes
- **5000–10000** — foreground data visuals
- **11000+** — overlays, labels, badges

Always create shapes **before** data visuals so z-order stays correct automatically.
