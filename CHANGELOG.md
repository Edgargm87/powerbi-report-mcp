# Changelog — powerbi-report-mcp

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
