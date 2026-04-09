<!-- doc-version: 1.0 | Last updated: 2026-04-09 -->
# Power BI Report Design Guide

Reference for LLMs building Power BI reports via powerbi-report-mcp.
All values are in pixels. Follow these rules exactly.

---

## Quick-Reference Cheat Sheet

| Property               | Value                              |
|-------------------------|------------------------------------|
| Page size               | 1280 x 720 (16:9)                 |
| Page margins            | 20px left, 20px right             |
| Usable content width    | 1240px (1280 - 20 - 20)           |
| Visual gap (horizontal) | 5px                                |
| Visual gap (vertical)   | 5px                                |
| Banner position         | x:0, y:0, full page width (1280)  |
| Banner height           | 52px                               |
| First content row y     | 57 (banner 52 + gap 5)            |
| Grid alignment          | 8px grid where practical           |
| Max visuals per page    | 6-8 optimal, 9-12 acceptable      |
| Max KPI cards per page  | 5                                  |
| Max colors per visual   | 6-8                                |
| Z-order: base visuals   | 0-999                              |
| Z-order: overlays       | 1000-1999                          |
| Text color (body)       | #333333 (never pure black)         |
| Banner background       | #1B2A4A                            |
| Banner text             | #FFFFFF, bold, 20-24pt             |

### Standard Color Palette

| Color   | Hex       | Use                              |
|---------|-----------|----------------------------------|
| Blue    | #0078D4   | Primary, positive values         |
| Green   | #107C10   | Secondary positive               |
| Orange  | #FF8C00   | Negative values, warnings        |
| Red     | #D83B01   | Critical negative                |
| Purple  | #8661C5   | Accent, categories               |

### Spacing Formula

To compute visual widths in a row:

```
visual_width = (1240 - (N - 1) * 5) / N
```

Where N = number of visuals in the row, 1240 = usable width, 5 = gap.

| Visuals in row | Each width | Gap total |
|----------------|------------|-----------|
| 1              | 1240       | 0         |
| 2              | 617.5      | 5         |
| 3              | 410        | 10        |
| 4              | 306.25     | 15        |
| 5              | 244        | 20        |

For unequal splits (e.g., 2/3 + 1/3):

```
wider  = round((1240 - 5) * 2 / 3) = 823
narrow = 1240 - 5 - 823            = 412
```

---

## 1. Layout Zones

Every page is divided into three horizontal zones stacked top-to-bottom:

| Zone | Purpose              | Typical contents                     | Approximate height |
|------|----------------------|--------------------------------------|--------------------|
| 1    | Banner + KPIs        | Page title shape, KPI cards, slicers | 140-150px          |
| 2    | Charts / Analysis    | Bar, line, scatter, combo charts     | 280-340px          |
| 3    | Tables / Details     | Tables, matrices, detail visuals     | 220-280px          |

Rules:
- Zone 1 always starts at y:0 with the banner shape.
- All zones span the full usable width (margins 20px each side).
- Vertical gaps between zones follow the same 5px rule.

---

## 2. Page Title Banner

Every page MUST have a banner as the first visual.

| Property      | Value                  |
|---------------|------------------------|
| Visual type   | shape                  |
| x             | 0                      |
| y             | 0                      |
| width         | 1280                   |
| height        | 52                     |
| Fill color    | #1B2A4A                |
| Text color    | #FFFFFF                |
| Font weight   | Bold                   |
| Font size     | 20-24pt                |
| Text align    | Left                   |
| Content       | textContent (shape)    |
| Z-order       | 0                      |

The banner spans full page width with NO margins (x:0, width:1280).
All other visuals below the banner use 20px left/right margins.

---

## 3. KPI Cards

### Design Rules

- Maximum 5 KPI cards per page.
- Each card shows three elements:
  1. **Headline number** -- largest font, primary value.
  2. **Gap / delta** -- medium font, conditionally colored.
  3. **Context label** -- smallest font, muted color.
- Apply conditional color (blue/orange) to the **gap/delta only**, never the headline number.
- Use blue (#0078D4) for positive, orange (#FF8C00) for negative. Avoid red/green pairs.
- The "20% change test": if the metric changed by 20%, would someone take action? If not, remove the card.

### Anti-Patterns (Do Not Do)

- Bare numbers with no comparison or context.
- Conditional formatting on the primary value.
- More than 5 cards on a single page.
- Loud saturated colors on headline numbers.
- Vanity metrics that do not drive decisions.

---

## 4. Tables and Matrices

### Choosing the Visual Type

| Scenario                                  | Visual type  |
|-------------------------------------------|--------------|
| Flat list, no grouping                    | tableEx      |
| Hierarchical / grouped rows              | pivotTable   |
| Cross-tab / pivot with row+column headers | pivotTable   |

### Column Order

1. Leading dimension(s) on the left.
2. Primary measure next.
3. Variance / delta columns on the right.

### Sorting

- Sort by the most important measure, descending.
- Never sort alphabetically by default.

### Formatting Philosophy: Subtract, Don't Add

- Remove heavy gridlines (use subtle or none).
- Remove or lighten alternating row banding.
- Increase row padding for readability.
- Use conditional formatting sparingly:
  - Data bars on the primary measure column only.
  - Color scale on variance column only.
- Never apply conditional formatting to every column.

### Anti-Patterns (Do Not Do)

- Flat table with repeating parent values (use matrix instead).
- Conditional formatting on every column.
- Heavy gridlines or dark banding.

---

## 5. Color and Accessibility

### WCAG 2.1 Contrast Requirements

| Element      | Minimum contrast ratio |
|--------------|----------------------|
| Normal text  | 4.5 : 1              |
| Large text   | 3 : 1                |

### Accessible Color Pairs

- Blue (#0078D4) + Orange (#FF8C00)
- Blue (#0078D4) + Yellow (#FFB900)
- Dark + Light of the same hue

### Rules

- Never use color alone to convey meaning. Always pair with text, icons, or patterns.
- No pure black (#000000) for text. Use #333333.
- No neon or fully saturated colors.
- Maximum 6-8 colors in any single visual.
- For positive/negative encoding: blue = positive, orange = negative.

---

## 6. Symmetry and Alignment

- All horizontal gaps between visuals in a row MUST be equal (5px).
- All vertical gaps between rows MUST be equal (5px).
- Column boundaries MUST align vertically across rows. If row 1 has a visual ending at x=639, row 2 should also have a visual edge at x=639.
- Align to an 8px grid where practical (visual positions and sizes should be multiples of 8 when possible, but 5px gaps take priority over grid alignment).

---

## 7. Performance Guidelines

| Visual count | Rating      | Action                         |
|--------------|-------------|--------------------------------|
| 6-8          | Optimal     | Ideal range                    |
| 9-12         | Acceptable  | Monitor render times           |
| 13-15        | Warning     | Consider splitting into pages  |
| 16+          | Avoid       | Split into multiple pages      |

---

## 8. Sample Layouts

All layouts use: page 1280x720, margins 20px L/R, gaps 5px, banner 1280x52 at (0,0).

### Layout A: Dashboard (4 KPIs + Slicer, 2 Charts, 3 Details)

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52  #1B2A4A                                       | y:0
+--[20px margin]------------------------------------------------[20px]--+
|  CARD1    |5| CARD2    |5| CARD3    |5| CARD4    |5| SLICER          | y:57
|  244x90       244x90       244x90       244x90       244x90          |
+-----------------------------------------------------------------------+
|  CHART-LEFT                |5| CHART-RIGHT                           | y:152
|  617x280                       618x280                               |
+-----------------------------------------------------------------------+
|  DETAIL-1       |5| DETAIL-2       |5| DETAIL-3                     | y:437
|  410x278            410x278            410x278                       |
+-----------------------------------------------------------------------+
                                                                   y:715
```

**Visual positions:**

| Visual      | x    | y    | width | height |
|-------------|------|------|-------|--------|
| Banner      | 0    | 0    | 1280  | 52     |
| Card 1      | 20   | 57   | 244   | 90     |
| Card 2      | 269  | 57   | 244   | 90     |
| Card 3      | 518  | 57   | 244   | 90     |
| Card 4      | 767  | 57   | 244   | 90     |
| Slicer      | 1016 | 57   | 244   | 90     |
| Chart Left  | 20   | 152  | 617   | 280    |
| Chart Right | 642  | 152  | 618   | 280    |
| Detail 1    | 20   | 437  | 410   | 278    |
| Detail 2    | 435  | 437  | 410   | 278    |
| Detail 3    | 850  | 437  | 410   | 278    |

**Verification:**
- Card row: 20 + 244 + 5 + 244 + 5 + 244 + 5 + 244 + 5 + 244 = 1260 (20 + 1240). Correct.
- Chart row: 20 + 617 + 5 + 618 = 1260. Correct.
- Detail row: 20 + 410 + 5 + 410 + 5 + 410 = 1260. Correct.
- Bottom edge: 437 + 278 = 715. Within 720. Correct.
- Vertical gaps: 52+5=57, 57+90+5=152, 152+280+5=437. All 5px. Correct.

---

### Layout B: Analysis (Large Chart + KPI Sidebar, Full-Width Table)

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52  #1B2A4A                                       | y:0
+--[20px margin]------------------------------------------------[20px]--+
|  SLICER-1           |5| SLICER-2           |5| SLICER-3             | y:57
|  410x40                 410x40                 410x40                |
+-----------------------------------------------------------------------+
|  MAIN CHART (2/3 width)         |5| KPI-1               412x93     | y:102
|  823x380                           +------------------------+       |
|                                 |5| KPI-2               412x93     |
|                                    +------------------------+       |
|                                 |5| KPI-3               412x93     |
|                                    +------------------------+       |
|                                 |5| KPI-4               412x86     |
+-----------------------------------------------------------------------+
|  TABLE (full width) 1240x233                                         | y:487
|                                                                       |
+-----------------------------------------------------------------------+
                                                                   y:720
```

**Visual positions:**

| Visual      | x    | y    | width | height |
|-------------|------|------|-------|--------|
| Banner      | 0    | 0    | 1280  | 52     |
| Slicer 1    | 20   | 57   | 410   | 40     |
| Slicer 2    | 435  | 57   | 410   | 40     |
| Slicer 3    | 850  | 57   | 410   | 40     |
| Main Chart  | 20   | 102  | 823   | 380    |
| KPI Card 1  | 848  | 102  | 412   | 93     |
| KPI Card 2  | 848  | 200  | 412   | 93     |
| KPI Card 3  | 848  | 298  | 412   | 93     |
| KPI Card 4  | 848  | 396  | 412   | 86     |
| Table       | 20   | 487  | 1240  | 233    |

**Verification:**
- Slicer row: 20 + 410 + 5 + 410 + 5 + 410 = 1260. Correct.
- Chart + sidebar: 20 + 823 + 5 + 412 = 1260. Correct.
- KPI stack: 102 + 93 + 5 + 93 + 5 + 93 + 5 + 86 = 482. Chart bottom: 102 + 380 = 482. Aligned. Correct.
- Table row: 487 + 233 = 720. Correct.
- Vertical gaps: 52+5=57, 57+40+5=102, 482+5=487. All 5px. Correct.

---

### Layout C: KPI Summary (6 Cards in 2 Rows, Wide Chart)

```
+--[1280]---------------------------------------------------------------+
|  BANNER (0,0) 1280x52  #1B2A4A                                       | y:0
+--[20px margin]------------------------------------------------[20px]--+
|  CARD-1         |5| CARD-2         |5| CARD-3                        | y:57
|  410x120            410x120            410x120                       |
+-----------------------------------------------------------------------+
|  CARD-4         |5| CARD-5         |5| CARD-6                        | y:182
|  410x120            410x120            410x120                       |
+-----------------------------------------------------------------------+
|  CHART (full width) 1240x413                                         | y:307
|                                                                       |
|                                                                       |
|                                                                       |
+-----------------------------------------------------------------------+
                                                                   y:720
```

**Visual positions:**

| Visual  | x    | y    | width | height |
|---------|------|------|-------|--------|
| Banner  | 0    | 0    | 1280  | 52     |
| Card 1  | 20   | 57   | 410   | 120    |
| Card 2  | 435  | 57   | 410   | 120    |
| Card 3  | 850  | 57   | 410   | 120    |
| Card 4  | 20   | 182  | 410   | 120    |
| Card 5  | 435  | 182  | 410   | 120    |
| Card 6  | 850  | 182  | 410   | 120    |
| Chart   | 20   | 307  | 1240  | 413    |

**Verification:**
- Card rows: 20 + 410 + 5 + 410 + 5 + 410 = 1260. Correct.
- Chart: 20 + 1240 = 1260. Correct.
- Bottom edge: 307 + 413 = 720. Correct.
- Vertical gaps: 52+5=57, 57+120+5=182, 182+120+5=307. All 5px. Correct.
- Column alignment: Card 1/4 at x:20, Card 2/5 at x:435, Card 3/6 at x:850. Aligned across rows. Correct.

---

## 9. Common Visual Sizing Reference

These are typical height ranges. Width depends on row layout (see spacing formula above).

| Visual type         | Typical height | Notes                                  |
|---------------------|----------------|----------------------------------------|
| Banner (shape)      | 52px           | Fixed. Full width, no margins.         |
| KPI card            | 80-120px       | Taller if showing delta + context.     |
| Slicer (dropdown)   | 40-55px        | Single row. Use full-row placement.    |
| Slicer (list)       | 120-200px      | Sidebar placement preferred.           |
| Bar / column chart  | 250-350px      | Minimum 250 for readable labels.       |
| Line / area chart   | 250-350px      | Same range as bar charts.              |
| Combo chart         | 280-350px      | Needs slightly more height for legend. |
| Scatter / bubble    | 300-400px      | Square or near-square aspect ratio.    |
| Table / matrix      | 200-350px      | Height depends on row count.           |
| Map                 | 300-400px      | Near-square aspect ratio.              |

---

## 10. Placement Procedure (Step by Step)

When building a page, follow this order:

1. **Create the page** at 1280x720.
2. **Place the banner** at (0, 0, 1280, 52).
3. **Determine the zone layout**: how many rows, how many visuals per row.
4. **Calculate widths** using the spacing formula for each row.
5. **Calculate y positions** top-down: each row y = previous row y + previous row height + 5.
6. **Calculate x positions** left-to-right: first visual x=20, next visual x = previous x + previous width + 5.
7. **Verify right edge**: last visual x + last visual width should equal 1260 (1280 - 20).
8. **Verify bottom edge**: last row y + last row height should be at most 720.
9. **Check column alignment** across rows where applicable.

### Handling Unequal Column Splits

For a 2/3 + 1/3 split:
- Left width: round((1240 - 5) * 2 / 3) = 823
- Right width: 1240 - 5 - 823 = 412
- Left x: 20
- Right x: 20 + 823 + 5 = 848

For a 1/3 + 2/3 split:
- Left width: round((1240 - 5) / 3) = 412
- Right width: 1240 - 5 - 412 = 823
- Left x: 20
- Right x: 20 + 412 + 5 = 437

For a 1/2 + 1/2 split:
- Left width: floor((1240 - 5) / 2) = 617
- Right width: 1240 - 5 - 617 = 618
- Left x: 20
- Right x: 20 + 617 + 5 = 642

For a 1/4 + 3/4 split:
- Left width: round((1240 - 5) / 4) = 309
- Right width: 1240 - 5 - 309 = 926
- Left x: 20
- Right x: 20 + 309 + 5 = 334

---

## 11. Z-Order Rules

| Layer          | Z-order range | Examples                        |
|----------------|---------------|---------------------------------|
| Base visuals   | 0-999         | Charts, tables, cards, slicers  |
| Overlays       | 1000-1999     | Buttons, bookmarks, tooltips    |

- The banner shape should be z-order 0.
- Place visuals in reading order (top-left to bottom-right) with incrementing z-order.
- Overlay elements (navigation buttons, toggle buttons) use 1000+.
