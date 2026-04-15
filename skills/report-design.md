<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
# Power BI Report Design Principles

## Layout Standards

- **Page size**: 1280×720 (default), 1920×1080 (widescreen)
- **Visual gap**: 5px between all visuals (horizontal and vertical)
- **Page margins**: 20px left/right, 20px top/bottom
- **Banner**: Full-width shape at (0, 0, 1280, 52) — no side margins
- **First content row**: y=57 (banner 52 + gap 5)
- **Max visuals per page**: 12-15 for performance and readability

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

### Executive Dashboard (overview page)
```
┌─────────────────────────────────────────────────┐
│ Banner (title + subtitle + date slicer)          │ y=0, h=52
├────────┬────────┬────────┬────────┬─────────────┤
│ KPI 1  │ KPI 2  │ KPI 3  │ KPI 4  │  KPI 5      │ y=57, h=100
├────────┴────────┴────────┼────────┴─────────────┤
│ Main chart               │ Secondary chart       │ y=162, h=270
│ (trend, bar, combo)      │ (donut, bar, map)     │
├──────────────────────────┼──────────────────────┤
│ Table / detail           │ Small chart           │ y=437, h=260
│                          │                       │
└──────────────────────────┴──────────────────────┘
```

### Detail / Analysis Page
```
┌─────────────────────────────────────────────────┐
│ Banner + slicers (segment, date range, category) │
├─────────────────────────────────────────────────┤
│ Full-width chart (trend over time)               │
├──────────────────────────┬──────────────────────┤
│ Comparison chart          │ Breakdown chart       │
├──────────────────────────┴──────────────────────┤
│ Detail table (scrollable, with sparklines/SVGs)  │
└─────────────────────────────────────────────────┘
```

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
