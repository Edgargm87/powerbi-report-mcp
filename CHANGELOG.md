# Changelog — powerbi-report-mcp

---

## [0.4.9] — 2026-04-07

### Added
- **Smart tool loading** — default mode loads only 9 core tools (~2,700 tokens) instead of all 42+ (~13,000 tokens). **82% reduction** in per-turn token overhead.
- `load_tools` meta-tool — lists available on-demand tools and activates them mid-session. Always active in both modes.
- `MCP_TOOLS=all` env var — loads all tools at startup for power users / dev machines.
- Deferred tool registration — tools not in the default set are stored and can be activated at runtime without server restart.

### Changed
- Default active tools: `set_report`, `list_pages`, `list_visuals`, `create_page`, `add_visual`, `get_visual`, `format_visual`, `update_visual_bindings`, `set_report_theme`, `bulk_bind`.
- Visual calculation tools (`list_visual_calculations`, `add_visual_calculation`, `delete_visual_calculation`) fully disabled — not registered in any mode. Parked pending PBI Desktop support.
- Bookmark tools remain unregistered (parked).
- README updated: tool loading modes, default vs on-demand tool reference, revised token overhead tables.
- Version bumped to 0.4.9.

---

## [0.4.8] — 2026-04-07

### Fixed
- **B12** `set_conditional_format` gradient — used `ColorLinear` expression in `visualContainerObjects.background` which PBI Desktop does not recognise. Fixed: rewrote to use `FillRule` expression in `objects.values` with `backColor` property, `linearGradient2`/`linearGradient3` structure, `dataViewWildcard` + `metadata` selector. Confirmed from PBI Desktop manual format read-back.
- **B13** `set_datapoint_colors` transparency — property name was `transparency` but PBI Desktop uses `fillTransparency`. Fixed property name; kept as separate no-selector dataPoint entry (matches PBI Desktop format).
- **B14** `add_visual_calculation` — stored calculations in `query.calculations[]` which is not a valid PBIR schema property. Rewrote to use `NativeVisualCalculation` projections in `queryState.Values.projections[]` (matching PBI Desktop format). **Note:** projections written via file edit not rendering — visual calculations parked for further investigation.

### Known Issues (Parked)
- Visual calculations (`NativeVisualCalculation` projections) — correct format identified but not rendering when written programmatically. May require PBI Desktop internal state initialization.
- Bookmark tools — registered in code but not exposed in MCP session.

---

## [0.4.7] — 2026-04-07

### Fixed
- **B06** `update_report_settings` — accepted arbitrary keys (e.g. `persistFilters`) which written to `report.json` caused PBIR schema error and report would not open. Fixed: added allowlist of valid setting keys; invalid keys return error before writing.
- **B07** `add_page_filter` relativeDate — `Condition.RelativeDate` is not a valid PBIR condition type. Fixed: rewrote `buildRelativeDateFilter` to use `Condition.Between` with `DateSpan`/`DateAdd` expressions matching what PBI Desktop writes. Also added `Version: 2` and `howCreated: "User"` (same requirement as TopN). Confirmed from PBI Desktop manual filter read-back.
- **B08** `set_conditional_format` — `isMeasure:false` built comparison using raw `Column` expression, adding an invalid non-aggregated projection (index 4) in table/matrix visuals. Fixed: now wraps column in `Aggregation` (Function:0 = Sum).
- **B09** `set_datapoint_colors` — used `selector: { metadata: name }` for all charts. This only works for series-based charts (Series bucket populated). Category-based charts (barChart, columnChart, pieChart etc. with Category bucket and no Series) require `selector: { data: [{ scopeId: { Comparison } }] }`. Fixed: added optional `categoryEntity` + `categoryProperty` params; when provided, builds data selector with scopeId Comparison on the category column.
- **B10** `add_visual` — `stackedBarChart` is not a valid Power BI built-in visual type (treated as missing custom visual). Correct type is `barChart` (PBI's stacked bar); `clusteredBarChart` is the clustered variant. Added note to visual type documentation.

### Changed
- `set_datapoint_colors` tool: new optional `categoryEntity` and `categoryProperty` params for category-based chart coloring.
- `update_report_settings` tool: description updated to list valid setting keys.

---

## [0.4.6] — 2026-04-06

### Fixed
- **B04 (cont.)** `add_page_filter` topN — two additional iterations after the Round 1 format fix:
  - **Round 2**: `Where[0].Condition.TopN` is not a valid PBIR condition type. Fixed: TopN uses a *subquery* pattern — `From` contains a `Type: 2` entry with a nested `Subquery.Query` (Select + OrderBy + Top N); `Where` uses `In` with `Table: { SourceRef: { Source: "subquery" } }`.
  - **Round 3**: TopN filter still not recognised by Power BI Desktop. Fixed: `howCreated: "User"` required at filter item level for PBI Desktop to treat it as a user-applied TopN filter. Confirmed by applying a manual filter in PBI Desktop, saving, and reading back the written JSON.
- **B05** `add_page_filter` topN scope — TopN is only valid at visual level in Power BI (not page/report level). Added optional `visualId` param to `add_page_filter`: when provided, filter is written to `visual.filterConfig`; when omitted with `filterType: "topN"`, tool returns an error instead of silently writing invalid data.

### Changed
- `add_page_filter` tool description updated to document `visualId` param and topN visual-level requirement.

---

## [0.4.5] — 2026-04-05

### Fixed
- **B04** `add_page_filter` — all three filter types (`categorical`, `topN`, `relativeDate`) were writing Power BI REST API format (`{ Categorical: {} }`) which fails PBIR schema validation. Fixed to emit DAX query format: `{ From: [...], Where: [{ Condition: { In/RelativeDate: {} } }] }` (topN subquery format corrected in v0.4.6). Also removed spurious `howCreated`/`objects` fields from filter items.
- **B01** `set_page_visibility` — `hidden` boolean rejected when MCP client serialises it as a string; fixed with `z.coerce.boolean()`
- **B02** All required array params (`bindings`, `formatting`, `colors`, `visualIds`, `updates`, `pageOrder`) — rejected when MCP client serialises arrays as JSON strings; fixed with `z.preprocess` wrapper across `bindings.ts`, `bulk.ts`, `format.ts`, `report.ts`
- **B03** `list_filters` slim mode — `Aggregation` FieldRef (used by auto-filters on SUM columns) fell back to raw JSON; fixed by adding Aggregation branch to `fieldRefToString`

### Added
- `tests.md` — full 26-test suite run against training report; all 26 pass; documents token estimates per operation

---

## [0.4.4] — 2026-04-05

### Added
- `image` visual: `imageUrl` + `imageScaling` (fit/fill/normal) params — sets `objects.general.imageUrl` in PBIR
- `actionButton` visual: `buttonText`, `buttonAction` (pageNavigation/URL/bookmark/back), `buttonActionTarget` — builds correct `objects.text` and `objects.action` structures
- `pageNavigator` visual: already worked; now documented alongside image/actionButton in skills/visuals.md

### Changed
- `createAndSaveVisual` — new branches for `image` and `actionButton` object building
- `VisualSpec` interface + `VisualSpecSchema` + `add_visual` tool schema updated with new params

---

## [0.4.3] — 2026-04-05

### Added
- `bulk_delete_visuals` — delete multiple visuals from a page in one call
- `bulk_update_format` — apply the same formatting to multiple visuals in one call (target: visual or container)
- `bulk_bind` — update data bindings on multiple visuals in one call, each with its own binding spec
- `list_visual_calculations` — list DAX visual calculations on a matrix/table visual
- `add_visual_calculation` — add a DAX visual calculation (RUNNINGSUM, RANK, MOVINGAVERAGE, etc.)
- `delete_visual_calculation` — delete a visual calculation by name

---

## [0.4.2] — 2026-04-05

### Added
- `get_page_summary` tool — returns all pages with their visuals in one call, replacing `list_pages` + N×`list_visuals` at session start
- `get_visual` gains `slim` param (default true) — returns type/position/bindings summary/title/filterCount (~50 tokens) instead of full PBIR JSON (~500–700 tokens)
- `list_filters` gains `slim` param (default true) — flattens PBIR FieldRef objects to `Table[Column]` strings

### Changed
- `add_visual` description: removed inline visual types list (~250 tokens/session) — use `get_visual_types` instead
- Trimmed verbose parameter descriptions across `createVisual.ts`, `themes.ts`, `format.ts`, `filters.ts` (~500–800 tokens off fixed schema overhead)
- `token-comparison.md` moved to project root — it is human-facing analysis, not an in-session skill
- `skills/token-usage.md` updated: `get_page_summary` replaces `list_pages` in optimal call sequence

---

## [0.4.1] — 2026-04-05

### Added
- `list_pages` gains `slim` param (default `true`) — returns id, displayName, visualCount, isActive, hidden only; set `slim=false` for width/height/displayOption
- `list_visuals` gains `slim` param (default `true`) — returns id, type, x, y, w, h, title; set `slim=false` for full position object + filterCount
- `skills/token-usage.md` — per-operation token costs, 5 build scenarios (bare minimum → full brand), multi-page scaling, /compact guidance, optimal call sequence
- `skills/token-comparison.md` — MCP vs CLI vs Manual token comparison, break-even analysis (~3 pages), /compact with/without for 5-page and 10-page sessions, decision table

### Changed
- README updated to v0.4.0 — all new tools documented (bookmarks, visibility, conditional format, diff_report_theme, filters), deployment note, Table[Column] shorthand, conditional formatting examples

---

## [0.4.0] — 2026-04-04

### Added
- `set_page_visibility` tool — hide/show pages from report navigation pane
- `set_conditional_format` tool — rules-based and gradient background/title color conditional formatting on visual containers
- `diff_report_theme` tool — compare a proposed theme JSON against the currently applied theme (added/removed/changed keys)
- `list_bookmarks`, `add_bookmark`, `rename_bookmark`, `delete_bookmark` tools (`src/tools/bookmarks.ts`)
- `skills/pages.md` — page management and bookmarks skill documentation
- `skills/report.md` — report connection, settings, PBIR structure reference
- `list_pages` now returns `hidden` field per page

### Changed
- `PageDefinition` interface gains optional `visibility?: number` (0=visible, 1=hidden)
- `BookmarkDefinition` and `BookmarksMetadata` types added to `pbir.ts`
- `PbirProject` gains bookmark path helpers: `bookmarksPath`, `bookmarksJsonPath`, `bookmarkPath`, `bookmarkJsonPath`, `getBookmarksMetadata`, `saveBookmarksMetadata`, `getBookmark`, `saveBookmark`, `deleteBookmark`
- `registerBookmarkTools` wired into `index.ts`

---

## [0.3.1] — 2026-04-03

### Added
- `src/tools/filters.ts` — `list_filters`, `add_page_filter` (categorical/topN/relativeDate), `remove_filter`, `clear_filters`
- `src/tools/themes.ts` — `set_report_theme`, `get_report_theme`, `remove_report_theme`, `list_report_themes`
- `skills/filters.md` — filter tools documentation
- `skills/slicers.md` — full documentation of all 4 slicer types (slicer, listSlicer, textSlicer, advancedSlicerVisual)
- `skills/themes.md` — theme tools documentation
- `StaticResources` helpers on `PbirProject`: `saveRegisteredResource`, `readRegisteredResource`, `listRegisteredResources`, `deleteRegisteredResource`

### Fixed
- `scatterChart` bucket corrected from `Category` to `Details` in `VISUAL_BUCKETS`
- Combo charts (`lineStackedColumnComboChart`, `lineClusteredColumnComboChart`) buckets corrected from `Y/Y2` to `ColumnY/LineY`
- `SLICER_VISUAL_TYPES` set introduced — `isFirst`/`active` flag and sort definition now apply to all 4 slicer types, not just `slicer`
- `image` added to `INSERT_BUTTON_VISUAL_TYPES` (requires `howCreated: "InsertVisualButton"`)
- `slicerMode` visualObjects only applied to `slicer` type — not listSlicer/textSlicer/advancedSlicerVisual

---

## [0.3.0] — 2026-04-03

### Added
- Full modular refactor: `src/tools/` split into `report.ts`, `visuals.ts`, `format.ts`, `bindings.ts`
- `src/helpers/createVisual.ts` — `parseFieldSpec`, `createAndSaveVisual`, Zod schemas, `NO_DATA_VISUAL_TYPES`, `INSERT_BUTTON_VISUAL_TYPES`, `SLICER_VISUAL_TYPES`
- `src/helpers/formatting.ts` — `buildFormattingProps`, `applyFormattingToTarget`, `applyDataColors`
- `src/helpers/defaults.ts` — `THEME_PRESETS` (dark, light, corporate, blue-purple)
- `src/context.ts` — `ServerContext` interface with project proxy
- `Table[Column]` shorthand notation for field bindings (`parseFieldSpec`)
- `safe()` wrapper in `index.ts` — all tool handlers return `isError` responses instead of crashing
- `howCreated: "InsertVisualButton"` support for actionButton, pageNavigator, image visuals
- `skills/visuals.md` — full 40-type visual reference
- `skills/shapes.md` — shape/textbox formatting reference
- `skills/formatting.md` — formatting layers, properties, title tool
- `skills/wireframes.md` — 15 page layout patterns with exact pixel coordinates from training report

### Changed
- `VISUAL_BUCKETS` expanded with azureMap, cardNew, stackedBarChart, funnelChart, pageNavigator, decompositionTreeVisual
- `filterConfig` added to `PageDefinition` interface
- `howCreated?: string` added to `VisualDefinition` interface
- Version bumped to 0.3.1 post-fix
