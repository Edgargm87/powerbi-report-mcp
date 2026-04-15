<!-- doc-version: 2.2 | Last updated: 2026-04-15 -->
# Power BI Report Design Principles

> This file covers **principles** (typography, color, slicer placement, KPI patterns).
> For the **mechanical layout rules** (margins, gaps, validated layouts, batch templates) see `skills/wireframes.md` — that file is the canonical source of truth and is verified against `src/wireframe-validator.ts`.

## Mental Model — Before You Place A Single Visual

Most "bad" Power BI reports aren't broken because of formatting or colors. They're broken because whoever built them started placing visuals before deciding what question the page answers. If you skip this section you will produce pages that technically pass the wireframe validator and still feel cluttered, redundant, or unreadable.

**Step 1 — Name the page's one job.** Every page answers exactly one question. "How did we do last quarter?", "Which customers are at risk?", "What's the pipeline looking like?". If you can't write that question in one sentence, don't place any visuals yet — ask the user. Two-question pages become two pages.

**Step 2 — Pick the headline number.** The page's job translates to a single most-important metric. That metric goes in the largest, leftmost, top-most card (the spot the eye hits first in English-reading left-to-right layouts). Everything else on the page is context or breakdown for that one number. If two metrics feel equally important, you probably have two pages.

**Step 3 — Context before detail.** After the headline, the next row is *how we got here* — trend, variance vs prior period, variance vs target. After that comes the *breakdown* — which segment, customer, product contributed. Detail tables go last, at the bottom, for users who want to audit. This is the 3-30-300 rule expressed as layout: the 3-second viewer only sees the headline, the 30-second viewer gets the trend row, the 300-second viewer drills into the tables.

**Step 4 — Delete rather than add.** Every visual competes for attention. A page with 8 visuals where 5 matter reads worse than a page with 5 visuals where all 5 matter. When you can't decide whether a chart belongs on the page, the default is: delete it. If the user asks where it went, you've just learned it actually matters — put it back. If they don't, you saved everyone cognitive load.

**Step 5 — Pre-attentive attributes are a budget.** Position, size, color, and motion are the four things the human eye processes before conscious thought. You have roughly **one** of each to spend per page. If every card is red, nothing is urgent. If every chart is a different color, nothing is emphasized. If five things move, the eye gives up. Spend the color budget on the one thing you want the viewer to notice.

These are not invented rules — they're the common core of every serious dataviz reference (Stephen Few's *Information Dashboard Design*, Cole Nussbaumer Knaflic's *Storytelling with Data*, Edward Tufte's *The Visual Display of Quantitative Information*, IBCS standards). Read one of those books once and the specific patterns below will make sense as consequences of the mental model rather than arbitrary rules.

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
