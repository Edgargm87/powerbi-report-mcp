---
name: design-power-bi-report
description: Use when polishing or theming a Power BI report — typography, colors, KPI cards, slicer placement, formatting taste decisions. Triggers on phrases like "make my report look better", "improve the design", "what colors should I use", "format this dashboard", "report doesn't look professional".
---

# Design a Power BI Report

Most "bad" Power BI reports aren't broken because of formatting or colors. They're broken because nobody decided what question the page answers before placing visuals. Design starts with a mental model, not a color picker.

## Mental model — before you place a single visual

1. **Name the page's one job.** Every page answers exactly one question. "How did we do last quarter?" "Which customers are at risk?" If you can't write it in one sentence, ask the user. Two-question pages become two pages.
2. **Pick the headline number.** The page's job translates to one most-important metric. It goes in the largest, leftmost, top-most card. Everything else is context or breakdown for that number.
3. **Context before detail.** Headline first; then trend/variance row; then breakdown by segment; then detail tables at the bottom. This is the 3-30-300 rule expressed as layout.
4. **Delete rather than add.** Every visual competes for attention. A 5-visual page where all 5 matter reads better than an 8-visual page where 5 matter.
5. **Pre-attentive attributes are a budget.** Position, size, color, motion — you have roughly one of each to spend per page. If every card is red, nothing is urgent. Spend the color budget on the one thing the viewer should notice.
6. **Stop at the theme. Polish belongs to the developer.** Set `pbir_set_report_theme` once and let it cascade. Avoid per-visual `pbir_format_visual` unless the user explicitly asked. Inline only titles, bindings, and semantic colors (gains green / losses red).

## Typography (Segoe UI defaults)

| Element | Size | Weight |
|---|---|---|
| Page title (banner) | 20-24pt | SemiBold |
| Section header | 14-16pt | SemiBold |
| Card value | 24-32pt | Bold |
| Card label | 10-12pt | Regular |
| Axis / data labels | 9-12pt | Regular |
| Footnote / source | 8-9pt | Regular |

## Color budget

- **Neutral base** (greys, off-white) for chrome — banners, borders, backgrounds.
- **One brand accent** for the headline metric and primary CTAs.
- **Two semantic colors** — green for gains, red for losses. Never use red for "important" — only for "bad."
- **Categorical palette** of 4-6 muted hues for breakdown charts. Avoid rainbow.

## KPI card pattern (concept vs visual type)

A "KPI" in design conversation usually means a single big number with a small label — that's `visualType:"card"`, not the Power BI `kpi` visual (which is the trend-arrow indicator and is rarely the right choice). Use `card` for headline numbers.

## Slicer placement

- Top of page (horizontal strip) for 2-4 slicers used by everyone.
- Left sidebar (narrow column) for 5+ slicers or detailed filters.
- Filter pane only for power users — most viewers won't open it.
- Always pin date/period slicers above everything else.

## Checkpoint discipline (scaled by scope)

- 1-3 visuals: no checkpoints.
- 4-7 visuals: one checkpoint before any `pbir_add_visual` — confirm the plan.
- 8+ visuals: three — plan, skeleton review, numbers-look-right.

Honour bypass phrases ("just build it", "go", "fast mode") — required checkpoints still fire but collapse to one short confirmation.

For the full design rationale (Stephen Few / Cole Knaflic / Tufte references), the 5 page layout patterns, full slicer placement matrix, and theme-vs-inline-formatting decision rules, ask the MCP: `pbir_guide("report-design")`.
