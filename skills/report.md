<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
# Skill: Report — Connection, Settings, Tool Loading & Model Cross-Reference

## When to use
Use these patterns to connect to a report, inspect or update report-level settings, reload Power BI Desktop, control which MCP tools are loaded for the session, and cross-reference the semantic model against the report.

## Tool surface

### Connection & report-level
| Tool | Purpose |
|---|---|
| `set_report` | Connect to a `.Report` folder or parent `.pbip` project |
| `get_report` | Show the currently connected report path |
| `get_report_settings` | Get full `report.json` (theme, settings, resourcePackages) |
| `update_report_settings` | Merge key-value pairs into `report.settings` (allowlisted keys) |
| `reload_report` | Kill PBI Desktop and reopen the `.pbip` to see disk changes |
| `set_filter_pane` | Show/hide and expand/collapse the filter pane (report-wide) |
| `set_visual_interaction` | Cross-filter / cross-highlight / disable interactions between visuals on a page |
| `manage_extension_measures` | Add/list/remove report-level DAX measures |

### Tool catalog management
| Tool | Purpose |
|---|---|
| `load_tools` | List available on-demand tools and activate them mid-session |
| `guide` | Read a topic from `skills/*.md` — discovered live from disk |

### Model cross-reference
| Tool | Purpose |
|---|---|
| `model_usage` | Cross-reference the semantic model with the report — measures, columns, DAX dependencies, unused fields, per-page coverage; also writes an HTML dashboard |

For page management see `skills/pages.md`. For visual chrome / backgrounds see `skills/pages.md`. For themes see `skills/themes.md`.

---

## `set_report`

Connect to a report at the start of every session, or to switch between reports without restarting the server.

```json
// .Report folder
{ "path": "C:/Projects/MyReport.Report" }

// Parent .pbip project (auto-discovers the .Report subfolder)
{ "path": "C:/Projects/MyProject" }
```

On connect the server also auto-starts model_usage watchers if a `.SemanticModel` is found next to the report — it generates a fresh HTML dashboard in the background and keeps it in sync as files change.

---

## `get_report`

```json
{}
```

Returns `{ "reportPath": "C:/Projects/MyReport.Report" }` (or `"No report connected"` if none).

---

## `get_report_settings`

```json
{}
```

Returns the full `report.json` content — `themeCollection`, `resourcePackages`, `settings`, schema info. Use this when you need to inspect the raw structure (e.g. to see what theme file is wired in).

---

## `update_report_settings`

```json
{
  "settings": {
    "useStylableVisualContainerHeader": true,
    "useEnhancedTooltips": true,
    "persistentFilters": true
  }
}
```

Merges into `report.settings` — keys you don't pass are preserved. Only allowlisted keys are accepted; anything else returns an error listing the valid set.

Allowed keys:
- `useStylableVisualContainerHeader` — boolean, enables modern visual headers
- `exportDataMode` — `0` summarized only, `1` summarized + underlying
- `defaultDrillFilterOtherVisuals` — boolean
- `allowChangeFilterTypes` — boolean
- `useEnhancedTooltips` — boolean
- `useDefaultAggregateDisplayName` — boolean
- `isPaginatedReportMode` — boolean
- `hideVisualContainerHeader` — boolean
- `useNewFilterPaneExperience` — boolean
- `optOutNewFilterPaneExperience` — boolean
- `persistentFilters` — boolean (save filter selections per user)
- `keyboardNavigationEnabled` — boolean

---

## `reload_report`

```json
{}
```

Kills `PBIDesktop.exe` (silently no-ops if not running), waits ~3 seconds, then reopens the `.pbip` next to the connected `.Report` folder. Use after a batch of changes to see them in Desktop.

> `reload_report` is intentionally in the **default** tool set rather than on-demand — most LLM harnesses snapshot the MCP tool catalog at startup, so a lazy-loaded `reload_report` could be activated server-side but never invoked from the client. Defaulting it closes that trap.

---

## `set_filter_pane`

Show/hide and expand/collapse the filter pane for the whole report.

```json
{ "visible": false, "expanded": false }
```

Common for executive dashboards where you've already pre-filtered with `add_page_filter` and don't want viewers tweaking it. See `skills/pages.md` for full details.

---

## `set_visual_interaction`

Override the default cross-filter behaviour between two visuals on a page.

```json
{
  "pageId": "<id>",
  "source": "<source visual id>",
  "target": "<target visual id>",
  "type": "Filter"
}
```

`type`: `Filter` (cross-filter), `Highlight` (cross-highlight), `NoFilter` (disable). Stored in `page.visualInteractions`. See `skills/pages.md` for usage patterns.

---

## `manage_extension_measures`

Add report-level DAX measures without modifying the semantic model — perfect for thin reports.

```json
// list
{ "operation": "list" }

// add
{
  "operation": "add",
  "tableName": "_Measures",
  "measureName": "Total Revenue",
  "expression": "SUM(Sales[Amount])",
  "dataType": "Double"
}

// remove
{ "operation": "remove", "measureName": "Total Revenue" }
```

> The tool auto-deletes `reportExtensions.json` when removing the last measure leaves it empty — an empty file crashes Power BI Desktop. See `skills/pages.md` for the data type list.

---

## `model_usage` — cross-reference the semantic model

Reads the `.SemanticModel` next to the report and walks every `visual.json` to build a usage map of every measure and column.

```json
// Slim (default) — usage counts per field, status (used/unused), per-page coverage
{ "slim": true }

// Full — adds DAX expressions, dependencies, per-visual usage detail
{ "slim": false }
```

Returns:
- `measures[]` — `name`, `table`, `usageCount`, `pageCount`, `status`, `daxDependencies` (slim), plus `daxExpression`, `dependedOnBy`, `usedIn` (full)
- `columns[]` — `name`, `table`, `usageCount`, `pageCount`, `status`, `isSlicerField` (slim), plus `dataType`, `usedIn` (full)
- `pages[]` — `name`, `visualCount`, `measureCount`, `columnCount`, `slicerCount`, `coverage`, `hidden`
- `hiddenPages[]` — page names hidden from the nav pane
- `unused` — `{ measures, columns }` arrays of `Table[Field]` strings
- `totals` — overall summary
- `dashboardPath` — local file path of the generated HTML dashboard

The cross-reference is also written to a standalone HTML dashboard at `<report>/.usage/index.html` — open it in a browser for a much richer view (Tables, Calc Groups, UDFs, Pages, Conditional Formatting, KPI tooltips, dark/light toggle).

The cache is invalidated automatically by:
- `delete_page`, `duplicate_page`
- `delete_visual`, `bulk_delete_visuals`
- File-system watchers on the report and semantic model folders (started at `set_report`)

Pass `reportPath` to inspect a different report without changing the connected one — it bypasses the cache.

### Common uses
- "What measures are unused?" → check `unused.measures`
- "Which DAX measures depend on `[Total Revenue]`?" → full mode → `dependedOnBy`
- "Which page has the worst measure coverage?" → sort `pages` by `coverage`
- "What columns are used as slicer fields?" → filter `columns` by `isSlicerField: true`

---

## `load_tools` — on-demand tool catalog

The MCP server ships with **12 default tools** loaded at startup and **42 on-demand tools** activated on request. The default set is tuned for low token overhead while still being able to do the most common report-building tasks.

### Default tools (always loaded)
```
set_report, list_pages, list_visuals, create_page, add_visual, get_visual,
format_visual, update_visual_bindings, set_report_theme, bulk_bind, model_usage,
reload_report
```

### List what's available
```json
{}
```
Returns:
```json
{
  "activeCount": 12,
  "availableCount": 42,
  "available": [{ "name": "delete_visual", "description": "..." }, ...],
  "hint": "Call load_tools with tool names to activate them."
}
```

### Activate specific tools
```json
{ "tools": ["set_visual_sort", "set_conditional_format", "audit_theme_compliance"] }
```

Returns `{ "activated": [...], "notFound": [...] }`.

### Load everything at startup
Set the environment variable `MCP_TOOLS=all` before launching the server — every tool loads immediately, no `load_tools` calls needed.

> **Harness caveat:** most LLM clients snapshot the MCP tool catalog at session start. If your harness behaves that way, `load_tools` activates tools on the server but they may not become invokable until the next session. Either start with `MCP_TOOLS=all` or use a harness that re-reads the catalog.

---

## `guide` — read a skill topic

```json
// list available topics
{ "topic": "list" }

// read a specific topic
{ "topic": "visuals" }
{ "topic": "slicers" }
{ "topic": "report-design" }
{ "topic": "svg-visuals" }
```

Topics are discovered live from `skills/*.md` files. Editing a `.md` file takes effect on the next call — no rebuild needed.

---

## PBIR folder structure

```
{Name}.Report/
├── definition/
│   ├── report.json              ← theme, settings, resourcePackages
│   ├── version.json             ← schema version (managed automatically)
│   ├── pages/
│   │   ├── pages.json           ← page order, active page
│   │   └── {pageId}/
│   │       ├── page.json        ← display name, size, visibility, filters, background
│   │       └── visuals/
│   │           └── {visualId}/
│   │               └── visual.json  ← type, position, bindings, formatting, filters
│   └── bookmarks/
│       ├── bookmarks.json
│       └── {bookmarkId}/bookmark.json
├── definition.pbir              ← semantic model reference
├── reportExtensions.json        ← extension measures (when present)
├── StaticResources/
│   └── RegisteredResources/     ← custom theme JSON files
└── .usage/                      ← model_usage HTML dashboard (auto-generated)
```

---

## Common workflows

### Start a new session
```
1. set_report path=<path to .Report or .pbip>
2. get_page_summary                ← one-call recon
3. (optional) load_tools tools=[…] ← activate any non-default tools you need
```

### Build a report from scratch
```
1. set_report
2. set_report_theme (brand colors)
3. create_page "Overview"
4. add_visual (batch mode) for the wireframe layer
5. add_visual (batch mode) for the data visuals with inline formatting
6. set_filter_pane visible=false
7. reload_report
```

### Audit an existing report
```
1. set_report
2. get_page_summary               ← all pages + visuals
3. model_usage slim=true          ← unused fields, coverage by page
4. audit_theme_compliance pageId  ← per-page override audit (skills/themes.md)
```

### Inspect what theme is applied
```
get_report_theme            ← returns base + custom + full custom JSON
list_report_themes          ← every theme file on disk
```

---

## report.json key sections

```json
{
  "$schema": "...",
  "settings": { "useStylableVisualContainerHeader": true, ... },
  "themeCollection": {
    "baseTheme":   { "name": "CY26SU02" },
    "customTheme": { "name": "Brand1712345.json", "type": "RegisteredResources" }
  },
  "resourcePackages": [
    {
      "name": "RegisteredResources", "type": "RegisteredResources",
      "items": [{ "name": "Brand1712345.json", "path": "Brand1712345.json", "type": "CustomTheme" }]
    }
  ],
  "objects": {
    "outspacePane": [{ "properties": { "visible": ..., "expanded": ... } }]   // set_filter_pane
  }
}
```

---

## Related skills
- `skills/pages.md` — page management, backgrounds, bookmarks, interactions
- `skills/visuals.md` — adding and configuring visuals
- `skills/formatting.md` — per-visual format, conditional format, sort
- `skills/themes.md` — theming, audit, diff
- `skills/filters.md` — page and visual filters
- `skills/slicers.md` — slicer visuals
- `skills/token-usage.md` — minimising tool-call overhead
