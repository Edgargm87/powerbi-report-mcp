<!-- doc-version: 2.1 | Last updated: 2026-04-15 -->
# Power BI Report Design Principles

> This file covers **principles** (typography, color, slicer placement, KPI patterns).
> For the **mechanical layout rules** (margins, gaps, validated layouts, batch templates) see `skills/wireframes.md` — that file is the canonical source of truth and is verified against `src/wireframe-validator.ts`.

## Layout Standards

- **Page size**: 1280×720 (default), 1920×1080 (widescreen)
- **Visual gap**: 5px between all visuals (horizontal and vertical)
- **Page margins**: 15px left, 15px right, 6px bottom (top 0)
- **Usable content area**: 1250×714 (`1280 − 15 − 15` × `720 − 6`)
- **Banner**: Full-width shape at (0, 0, 1280, 52) — exempt from side margins
- **First content row**: y=57 (banner 52 + gap 5)
- **Max visuals per page**: 12-15 for performance and readability

For the five validated layouts (Dashboard, Analysis, KPI Summary, Sidebar Nav, 3×3 Grid), the spacing formula, the placement procedure, and the batch-creation template, see `skills/wireframes.md`.

## Typography (Segoe UI)

| Element | Size | Weight |
|---------|------|--------|
| Page title (in banner) | 20-24pt | SemiBold |
| Section header | 14-16pt | SemiBold |
| Card value | 24-32pt | Bold |
| Card label | 10-12pt | Regular |
| Axis labels | 10-12pt | Regular |
| Data labels | 9-11pt | Regular |
| Footnote/source | 8-9pt | Regular |

## The 3-30-300 Rule

- **3 seconds**: A viewer should understand the page purpose in 3 seconds (clear title, obvious KPIs)
- **30 seconds**: Key insights should be digestible in 30 seconds (well-labeled charts, logical flow)
- **300 seconds**: Detailed exploration should be available for 5 minutes (drill-through, tooltips, detail pages)

## Page Layout Patterns

Use one of the five validated layouts in `skills/wireframes.md`:

| Layout | Best for | Visuals |
|---|---|---|
| **A — Dashboard** | Executive overview with KPIs + 2 charts + 3 details | 11 |
| **B — Analysis** | Single big chart with KPI sidebar, full-width detail table | 10 |
| **C — KPI Summary** | 6 cards over a wide hero chart | 8 |
| **D — Sidebar Nav** | Detail page with a left-rail nav slicer | 9 |
| **E — 3×3 Tile Grid** | Equal-weight tiles, no hierarchy | 10 |

Don't invent ad-hoc layouts in prose — read `guide("wireframes")` for the validated coordinates.

## Color Usage

- **Limit**: 5-7 distinct data colors per page maximum
- **Semantic colors**: Green=positive, Red=negative, Amber=warning — use consistently
- **Accessibility**: WCAG 2.1 requires 4.5:1 contrast ratio for text, 3:1 for large text/graphics
- **Avoid**: Pure red (#FF0000) + green (#00FF00) — 8% of males are red-green colorblind
- Use the theme's `dataColors` palette — don't override per-visual unless intentional

## Slicer Placement

- **Horizontal slicers**: Top of page, in or below the banner
- **Vertical slicers**: Left sidebar (use a narrow column, ~200px wide)
- **Dropdown**: Best for many values (>10 options) to save space
- **Sync slicers**: Use the same slicer across pages for consistent filtering

## KPI Card Pattern

A KPI card typically shows:
1. **Value** — the primary metric (large, bold)
2. **Label** — what the metric is (smaller, muted)
3. **Trend indicator** — vs prior period (arrow/color)

Use the new `cardVisual` type for richer card formatting.
For inline trend arrows, use SVG measures — see `guide("svg-visuals")`.

## Performance Tips

- Avoid background images (use solid colors or theme)
- Minimize visuals with high cardinality dimensions
- Use `model_usage` tool to find unused measures/columns for cleanup
- Prefer explicit measures over implicit aggregations
