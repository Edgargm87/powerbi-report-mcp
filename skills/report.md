<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
<!-- summary: pbir_set_report / pbir_reload_report, pbir_get_report_settings, pbir_load_tools progressive surface, pbir_model_usage for column/measure cross-reference against sibling SemanticModel. Read at session start. -->
# Skill: Report — Connection, Settings, Tool Loading & Model Cross-Reference

## When to use
Use these patterns to connect to a report, inspect or update report-level settings, reload Power BI Desktop, control which MCP tools are loaded for the session, and cross-reference the semantic model against the report.

## Tool surface

### Connection & report-level
| Tool | Purpose |
|---|---|
| `pbir_set_report` | Connect to a `.Report` folder or parent `.pbip` project |
| `pbir_get_report` | Show the currently connected report path |
| `pbir_get_report_settings` | Get full `report.json` (theme, settings, resourcePackages) |
| `pbir_update_report_settings` | Merge key-value pairs into `report.settings` (allowlisted keys) |
| `pbir_reload_report` | Kill PBI Desktop and reopen the `.pbip` to see disk changes |
| `pbir_set_filter_pane` | Show/hide and expand/collapse the filter pane (report-wide) |
| `pbir_set_visual_interaction` | Cross-filter / cross-highlight / disable interactions between visuals on a page |
| `pbir_manage_extension_measures` | Add/list/remove report-level DAX measures |

### Tool catalog management
| Tool | Purpose |
|---|---|
| `pbir_load_tools` | List available on-demand tools and activate them mid-session |
| `pbir_guide` | Read a topic from `skills/*.md` — discovered live from disk |

### Model cross-reference
| Tool | Purpose |
|---|---|
| `pbir_model_usage` | Cross-reference the semantic model with the report — measures, columns, DAX dependencies, unused fields, per-page coverage; also writes an HTML dashboard |

For page management see `skills/pages.md`. For visual chrome / backgrounds see `skills/pages.md`. For themes see `skills/themes.md`.

---

## `pbir_set_report`

Connect to a report at the start of every session, or to switch between reports without restarting the server.

```json
// .Report folder
{ "path": "C:/Projects/MyReport.Report" }

// Parent .pbip project (auto-discovers the .Report subfolder)
{ "path": "C:/Projects/MyProject" }
```

On connect the server also auto-starts pbir_model_usage watchers if a `.SemanticModel` is found next to the report — it generates a fresh HTML dashboard in the background and keeps it in sync as files change.

---

## `pbir_get_report`

```json
{}
```

Returns `{ "reportPath": "...", "hasSemanticModel": boolean }` (or `reportPath: "No report connected"` if none).

`hasSemanticModel` tells you whether a sibling `.SemanticModel/` folder exists next to the report:
- `true` → local/bundled model. Use `pbir_model_usage` for the real column/measure cross-reference.
- `false` → the report is **live-connected** to a remote dataset (Fabric/Power BI Service, or another report's model). There's no local `.SemanticModel` to parse, so `pbir_model_usage` can only see report-level extension measures (`reportExtensions.json`), not the real remote schema.

### Live-connected reports: `liveConnection`

When `hasSemanticModel` is `false` and `definition.pbir` has a `byConnection` dataset reference, the response also includes a parsed `liveConnection` object:

```json
{
  "reportPath": "...",
  "hasSemanticModel": false,
  "liveConnection": {
    "workspace": "Bodega de datos",
    "dataset": "Datamart - Microcredito",
    "semanticModelId": "97cdf91e-bd99-4e2c-82f9-e660a1ee1b33",
    "extra": { "access mode": "readonly", "integrated security": "ClaimsToken" }
  }
}
```

This is parsed straight out of `definition.pbir`'s raw `byConnection.connectionString` (a semicolon-delimited PBI pseudo connection string — not standard ADO.NET/OLE DB), so you never have to ask the user for the workspace or dataset name.

**Hand these off to `powerbi-modeling-mcp` to read the real remote schema:**
```json
{
  "operation": "ConnectFabric",
  "workspaceName": "<liveConnection.workspace>",
  "semanticModelName": "<liveConnection.dataset>"
}
```
via `connection_operations`. This reaches the actual Fabric/Power BI Service model — the DAX tables, columns, and measures behind the live connection — instead of only the thin report-level extension measures this MCP can see on its own.

**If `ConnectFabric` fails with a `Discover` permission error** (`"...user does not have permission to call the Discover method"`), that is a **Power BI Service permissions issue on the account calling it**, not a bug in the parsing or the handoff — the connecting account needs at least **Build** permission on that semantic model in the workspace. See `skills/errors.md` for the exact error text and recovery options.

---

## `pbir_get_report_settings`

```json
{}
```

Returns the full `report.json` content — `themeCollection`, `resourcePackages`, `settings`, schema info. Use this when you need to inspect the raw structure (e.g. to see what theme file is wired in).

---

## `pbir_update_report_settings`

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

## `pbir_reload_report`

```json
{ "confirm": true }
```

Kills `PBIDesktop.exe` (silently no-ops if not running), waits ~3 seconds, then reopens the `.pbip` next to the connected `.Report` folder. Use after a batch of changes to see them in Desktop.

### ⚠ Save-first safety gate

`pbir_reload_report` requires `confirm: true` to proceed. When called without it, the tool returns a structured warning instead of killing Desktop — the agent must relay the warning to the user, wait for acknowledgment, then retry with `confirm: true`.

**Why the gate exists.** Closing PBI Desktop discards any in-memory state that hasn't been Ctrl+S'd. If the user (or a sibling modeling MCP) made measure/relationship/column changes that PBI Desktop hasn't flushed, they vaporise on reload. This MCP can't see Desktop's unsaved state, so the only safe default is to force a user acknowledgment.

**Agent protocol:**
1. First call to `pbir_reload_report` — omit `confirm` (or pass `false`). Tool returns a save-first warning.
2. Relay the warning verbatim. Ask the user to focus PBI Desktop, hit Ctrl+S, then reply "reload" / "go" / "confirmed".
3. On user confirmation, retry with `confirm: true`.
4. **After** reload succeeds, run `pbir_model_usage` if any modeling work happened this session — verify the new measures/columns are actually present before binding visuals to them.

**When to skip the gate.** Pass `confirm: true` on the first call only when you know there's no unsaved Desktop state — e.g. the user just connected via `pbir_set_report` and hasn't touched Desktop since, or the user has already confirmed save in a prior turn this session.

> `pbir_reload_report` is intentionally in the **default** tool set rather than on-demand — most LLM harnesses snapshot the MCP tool catalog at startup, so a lazy-loaded `pbir_reload_report` could be activated server-side but never invoked from the client. Defaulting it closes that trap.

---

## `pbir_set_filter_pane`

Show/hide and expand/collapse the filter pane for the whole report.

```json
{ "visible": false, "expanded": false }
```

Common for executive dashboards where you've already pre-filtered with `pbir_add_page_filter` and don't want viewers tweaking it. See `skills/pages.md` for full details.

---

## `pbir_set_visual_interaction`

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

## `pbir_manage_extension_measures`

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

## `pbir_model_usage` — cross-reference the semantic model

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
- `pbir_delete_page`, `pbir_duplicate_page`
- `pbir_delete_visual`, `pbir_bulk_delete_visuals`
- File-system watchers on the report and semantic model folders (started at `pbir_set_report`)

Pass `reportPath` to inspect a different report without changing the connected one — it bypasses the cache.

### Common uses
- "What measures are unused?" → check `unused.measures`
- "Which DAX measures depend on `[Total Revenue]`?" → full mode → `dependedOnBy`
- "Which page has the worst measure coverage?" → sort `pages` by `coverage`
- "What columns are used as slicer fields?" → filter `columns` by `isSlicerField: true`

---

## `pbir_load_tools` — on-demand tool catalog

**By default, all 55 tools load at startup.** This matches reality — most MCP clients (Claude Desktop especially) snapshot the tool catalog at session start and don't handle `tools/list_changed`, so lazy activation was dead weight there.

### Minimal mode (opt-in)
Set `MCP_TOOLS=minimal` before launching the server to load only the 12 core tools at startup. The remaining 42 are activated via `pbir_load_tools`. Saves ~7,500 tokens of schema overhead — worth it only for long Claude Code sessions on a tight context budget.

### Default tools (minimal mode — always loaded)
```
pbir_set_report, pbir_list_pages, pbir_list_visuals, pbir_create_page, pbir_add_visual, pbir_get_visual,
pbir_format_visual, pbir_update_visual_bindings, pbir_set_report_theme, pbir_bulk_bind, pbir_model_usage,
pbir_reload_report
```

### List what's available (minimal mode only)
```json
{}
```
Returns:
```json
{
  "activeCount": 12,
  "availableCount": 42,
  "available": [{ "name": "pbir_delete_visual", "description": "..." }, ...],
  "hint": "Call pbir_load_tools with tool names to activate them."
}
```

### Activate specific tools (minimal mode only)
```json
{ "tools": ["pbir_set_visual_sort", "pbir_set_conditional_format", "pbir_audit_theme_compliance"] }
```

Returns `{ "activated": [...], "notFound": [...], "refreshHint": "..." }`.

> **Harness caveat:** most LLM clients snapshot the MCP tool catalog at session start. If your harness behaves that way, `pbir_load_tools` activates tools on the server but they may not become invokable until the next session. Either use the default (all tools loaded) or use a harness that re-reads the catalog. Claude Desktop users: stick with the default.

---

## `pbir_guide` — read a skill topic

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
└── .usage/                      ← pbir_model_usage HTML dashboard (auto-generated)
```

---

## Common workflows

### Start a new session
```
1. pbir_set_report path=<path to .Report or .pbip>
2. pbir_list_pages({includeVisuals: true})                ← one-call recon
3. (optional) pbir_load_tools tools=[…] ← activate any non-default tools you need
```

### Build a report from scratch
```
1. pbir_set_report
2. pbir_set_report_theme (brand colors)
3. pbir_create_page "Overview"
4. pbir_add_visual (batch mode) for the wireframe layer
5. pbir_add_visual (batch mode) for the data visuals with inline formatting
6. pbir_set_filter_pane visible=false
7. pbir_reload_report
```

### Audit an existing report
```
1. pbir_set_report
2. pbir_list_pages({includeVisuals: true})               ← all pages + visuals
3. pbir_model_usage slim=true          ← unused fields, coverage by page
4. pbir_audit_theme_compliance pageId  ← per-page override audit (skills/themes.md)
```

### Inspect what theme is applied
```
pbir_get_report_theme            ← returns base + custom + full custom JSON
pbir_list_report_themes          ← every theme file on disk
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
    "outspacePane": [{ "properties": { "visible": ..., "expanded": ... } }]   // pbir_set_filter_pane
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
