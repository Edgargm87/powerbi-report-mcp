---
name: build-power-bi-report
description: Use when the user wants to build, design, or scaffold a Power BI report or dashboard. Triggers on phrases like "build a Power BI report", "create a dashboard", "make a sales report", "design a Power BI page", "add a page to my report", "I need a report for X". Covers requirements elicitation — what to ask the user before building, when to skip questions and just build.
---

# Build a Power BI Report

This plugin wraps the `powerbi-report-mcp` server, which writes directly into a `.pbip` (Power BI Project) folder in PBIR format. Before you start building, decide how much to ask the user — and the answer is usually "nothing, just build it."

## The default is BUILD

Asking questions has a cost: every unnecessary question trains the user to dread asking for things. Default to building. Elicit only when the work is large enough that guessing wrong wastes real time.

## Trigger matrix — scale questions to scope

| Request scope | Questions to ask |
|---|---|
| **Atomic change** (1 visual, 1 property) | Zero. Build it. |
| **Small build** (2-3 visuals on existing page) | Zero. Pick sensible defaults from `model_usage`, build. |
| **Page build** (4-7 visuals, new page) | One question — the single biggest missing signal (usually audience or the 2-3 must-have measures). |
| **Dashboard build** (8+ visuals, or multi-page) | The 5-signal form, in one batch. |
| **Blank report, no context** | Offer a menu. Don't auto-build. |

## Bypass phrases — always skip elicitation

If the user says any of these, go straight to building: "just build it", "go", "fast mode", "skip questions", "use defaults", "your call", "surprise me", "quick", "rough version", any explicit "skip the X" or "don't ask".

## The 5-signal form (dashboard scope only)

```
Dashboard build, five quick questions (reply "defaults" to skip):

1. Audience — executive, analyst, ops, external?         (default: executive)
2. Purpose — monitor / explore / story / audit?          (default: monitor)
3. Must-include measures — which 2-4 are non-negotiable? (default: top from model_usage)
4. Layout — KPI strip / summary-detail / drill / sidebar? (default: KPI strip)
5. Brand — hex colors, or theme defaults?                (default: theme)
```

## Session memory

Once the user answers in a session, those answers stick for the rest of the session. Don't re-ask. Reset only on a new `set_report` to a different report path.

## report-spec.md shortcut

If a `report-spec.md` file sits next to the `.pbip`, read it on `set_report` and skip elicitation entirely. It can pre-populate all 5 signals.

## Workflow once you start building

1. `set_report` to point at the `.pbip` folder.
2. `model_usage` to discover available tables/columns/measures.
3. `list_pages` to see what's already there (modifications never trigger elicitation — existing content is the spec).
4. For new pages with 4+ visuals, prefer `layout_grid` (the server owns the margin/gap math) over hand-computing pixel positions for each `add_visual`.
5. Set the theme once with `set_report_theme` and let it cascade. Avoid per-visual `format_visual` calls unless the user explicitly asked for a specific look.
6. Tell the user to refresh in Power BI Desktop when done (or to call `reload_report` if they're using the live-preview workflow).

## Checkpoints — also scaled by scope

- 1-3 visuals: no checkpoints, just build.
- 4-7 visuals: one checkpoint — confirm the plan before any `add_visual`.
- 8+ visuals: three checkpoints — plan, skeleton review (`list_pages({includeVisuals: true})`), and a numbers-look-right check before polish.

Bypass phrases override optional checkpoints. The required ones still fire but collapse to a single short confirmation.

For full details — including the report-spec.md schema, exact checkpoint scripts, and edge cases — ask the MCP: `guide("elicitation")`.
