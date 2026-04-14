<!-- doc-version: 1.4 | Last updated: 2026-04-14 -->
# Changelog — powerbi-report-mcp

Each release has its own file in [`changelog/`](changelog/).

| Version | Date | Highlights |
|---------|------|------------|
| [**0.5.4**](changelog/v0.5.4.md) | 2026-04-14 | Usage dashboard: **Calc Groups** tab (TMDL + BIM parser, per-item DAX expressions, precedence), **Tables tab** (PK/FK/relationship rendering, inferred PK detection), **light mode** with toggle and localStorage persistence, **KPI tooltips**, **copy-DAX button** on code blocks, **HIDDEN badge** for tooltip/drillthrough pages, dark-mode readability bump. **Wireframe validator** (`src/wireframe-validator.ts`) — pure function that catches out-of-bounds, overlaps, wrong margins/gaps, silent (0,0) defaults, rounding overflow, and the new **6px bottom margin** rule. **Shape text** — `createVisual.ts` now emits labels into the `objects.text` branch (was silently ignored via `general.paragraphs`), with friendly font names, bold/italic/underline, alignment, padding. **Skill rewrites** (`skills/shapes.md` v2.0 + `skills/wireframes.md` v2.0) matching the canonical constants, and a Python builder for the 5-page wireframe test report |
| [**0.5.3**](changelog/v0.5.3.md) | 2026-04-13 | Usage dashboard: three-tier field classification, UDF functions tab, conditional formatting detection, native folder picker, standalone web app |
| [**0.5.2**](changelog/v0.5.2.md) | 2026-04-12 | Bookmarks unparked (4 tools), `set_page_background`, `guide` knowledge layer (SVG visuals + report design topics) |
| [**0.5.1**](changelog/v0.5.1.md) | 2026-04-11 | New `model_usage` tool — cross-references semantic model with report, HTML dashboard, standalone CLI, cache invalidation |
| [**0.5.0**](changelog/v0.5.0.md) | 2026-04-09 | 5 new tools (sort, interactions, filter pane, extension measures, theme audit), format auto-routing, tooltip/drillthrough pages, advanced filters, wireframes doc, doc versioning |
| [**0.4.9**](changelog/v0.4.9.md) | 2026-04-08 | Smart tool loading (10 default / 37 on-demand), `load_tools` meta-tool, ARCHITECTURE.md, CONTRIBUTING.md, pbir-gotchas, visual-types, quickstart, sample report |
| [**0.4.8**](changelog/v0.4.8.md) | 2026-04-07 | Fix B12 gradient conditional format, B13 transparency property, B14 visual calculations (parked) |
| [**0.4.7**](changelog/v0.4.7.md) | 2026-04-07 | Fix B06 report settings allowlist, B07 relativeDate filter, B08 conditional format aggregation, B09 datapoint color selectors, B10 stackedBarChart naming |
| [**0.4.6**](changelog/v0.4.6.md) | 2026-04-06 | Fix B04 TopN subquery + `howCreated`, B05 TopN visual-level scope |
| [**0.4.5**](changelog/v0.4.5.md) | 2026-04-05 | Fix B01-B04 filter formats, boolean coercion, array preprocessing, Aggregation FieldRef |
| [**0.4.4**](changelog/v0.4.4.md) | 2026-04-05 | Image, actionButton, pageNavigator visual support |
| [**0.4.3**](changelog/v0.4.3.md) | 2026-04-05 | Bulk operations (delete, format, bind), visual calculations (parked) |
| [**0.4.2**](changelog/v0.4.2.md) | 2026-04-05 | `get_page_summary`, slim modes for get_visual/list_filters |
| [**0.4.1**](changelog/v0.4.1.md) | 2026-04-05 | Slim modes for list_pages/list_visuals, token usage guide |
| [**0.4.0**](changelog/v0.4.0.md) | 2026-04-04 | Page visibility, conditional formatting, bookmarks, diff_report_theme |
| [**0.3.1**](changelog/v0.3.1.md) | 2026-04-03 | Filters, themes, slicers, StaticResources helpers |
| [**0.3.0**](changelog/v0.3.0.md) | 2026-04-03 | Modular refactor, Table[Column] shorthand, safe() wrapper, 40-type visual reference |
