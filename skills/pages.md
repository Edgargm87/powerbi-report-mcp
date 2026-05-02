<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
<!-- summary: pbir_create_page, rename/reorder/duplicate/delete, page visibility, backgrounds (solid + image), bookmarks, page-level filters. Read when structuring multi-page reports. -->
# Skill: Pages — Page Management, Navigation, Backgrounds, Bookmarks

## When to use
Use these patterns to create, organise, size, theme, navigate between, and interact with pages in a Power BI report — including standard pages, tooltip pages, drillthrough pages, page backgrounds, the filter pane, cross-filter behaviour, and bookmarks.

## Tool surface

### Pages
| Tool | Purpose |
|---|---|
| `pbir_list_pages` | List all pages — slim mode (default) returns id/displayName/visualCount/isActive/hidden |
| `pbir_create_page` | Add a new standard, tooltip, or drillthrough page |
| `pbir_rename_page` | Rename a page |
| `pbir_delete_page` | Delete a page and all its visuals |
| `pbir_reorder_pages` | Set the page tab order |
| `pbir_set_active_page` | Set which page opens by default |
| `pbir_set_page_visibility` | Show or hide a page in the navigation pane |
| `pbir_update_page_size` | Change width / height / displayOption |
| `pbir_duplicate_page` | Clone a page with all its visuals (regenerates filter IDs) |
| `pbir_auto_layout` | Reflow all visuals on a page into a grid |
| `pbir_list_pages({includeVisuals: true})` | One-shot pages + visuals recon (replaces `pbir_list_pages` + N×`pbir_list_visuals`) |

### Page visuals & chrome
| Tool | Purpose |
|---|---|
| `pbir_set_page_background` | Canvas background color and/or wallpaper, with `clear` option |
| `pbir_set_filter_pane` | Show/hide and expand/collapse the filter pane (report-wide) |
| `pbir_set_visual_interaction` | Cross-filter / cross-highlight / disable between two visuals on a page |
| `pbir_manage_extension_measures` | Add/list/remove report-level DAX measures (no model edit needed) |

### Bookmarks
| Tool | Purpose |
|---|---|
| `pbir_list_bookmarks` | List all bookmarks |
| `pbir_add_bookmark` | Create a new bookmark (empty state — capture in Desktop) |
| `pbir_rename_bookmark` | Rename a bookmark |
| `pbir_delete_bookmark` | Delete a bookmark |

---

## `pbir_list_pages`

```json
// Slim (default) — best for quick orientation
{ "slim": true }
```

Returns per page:
```json
{
  "id": "<pageId>",
  "displayName": "Sales Overview",
  "width": 1280,
  "height": 720,
  "visualCount": 12,
  "isActive": true,
  "hidden": false
}
```

The response also includes top-level `totalVisualCount` (sum of `visualCount` across the FULL page set, not just the visible slice when paginated) — use it for cross-report decisions without paging through every page. `slim: false` additionally adds `displayOption`. Pass `includeVisuals: true` (or a `pageId`) to get each page's visuals in the same call — replaces `pbir_list_pages` + N×`pbir_list_visuals`.

**Cross-page queries — prefer `includeVisuals: true`.** When the question is "find all pages with type X" or "count visuals across the report", call `pbir_list_pages({ includeVisuals: true })` once instead of fanning out N parallel `pbir_list_visuals` per page. Same data, far fewer round-trips. For scoped per-page sweeps, `pbir_list_visuals({ visualType: "..." })` is the cheap follow-up.

---

## `pbir_create_page`

### Standard page
```json
{
  "displayName": "Executive Summary",
  "width": 1280,
  "height": 720,
  "displayOption": "FitToPage"
}
```

Defaults: `1280×720`, `FitToPage`. Common sizes:
- Standard 16:9: 1280×720
- 16:10: 1280×800
- Portrait (A4-ish): 794×1122
- Wide / 4K: 1920×1080
- Narrow sidebar: 400×720

### Tooltip page
```json
{ "displayName": "Region Tooltip", "type": "tooltip" }
```

`type: "tooltip"` auto-applies: width 320, height 240, `displayOption: "ActualSize"`, `type: "Tooltip"`, and `visibility: "HiddenInViewMode"`. Override individual fields if needed.

### Drillthrough page
```json
{
  "displayName": "Product Detail",
  "drillthrough": { "entity": "Product", "property": "Name" }
}
```

The `drillthrough` field adds a categorical filter with `isAllFilter: true` on the chosen column — the page becomes a drillthrough target whenever a viewer right-clicks a `Product[Name]` value elsewhere in the report. Combine with `pbir_set_page_visibility hidden=true` to keep it out of the nav pane.

---

## `pbir_rename_page` / `pbir_delete_page` / `pbir_reorder_pages` / `pbir_set_active_page`

```json
{ "pageId": "<id>", "displayName": "New Name" }            // pbir_rename_page
{ "pageId": "<id>" }                                        // pbir_delete_page (irreversible)
{ "pageOrder": ["<id1>", "<id2>", "<id3>"] }                // pbir_reorder_pages — pass full ordered array
{ "pageId": "<id>" }                                        // pbir_set_active_page
```

If you delete the active page, the first remaining page becomes active automatically.

---

## `pbir_set_page_visibility`

```json
{ "pageId": "<id>", "hidden": true }
```

- `hidden: true` writes `visibility: "HiddenInViewMode"` — page is hidden from the nav pane and from `pageNavigator` visuals
- `hidden: false` removes the property — page is visible again
- Hidden pages remain reachable via drillthroughs, action buttons, and bookmarks

---

## `pbir_update_page_size`

```json
{
  "pageId": "<id>",
  "width": 1280,
  "height": 720,
  "displayOption": "FitToPage"
}
```

`displayOption`: `FitToPage` | `FitToWidth` | `ActualSize`.

---

## `pbir_duplicate_page`

```json
{ "pageId": "<sourceId>", "displayName": "Copy of Sales" }
```

Clones the page and every visual on it with new IDs. Filter IDs inside the visuals are regenerated so the duplicate doesn't collide with the source. `displayName` defaults to `"Copy of <original>"`.

---

## `pbir_auto_layout`

Arranges every visual on the page into a uniform grid:

```json
{
  "pageId": "<id>",
  "columns": 3,
  "padding": 10,
  "marginTop": 10,
  "marginLeft": 10
}
```

Useful as a starting point after dumping a bunch of visuals onto a page without explicit positioning. For pixel-precise layouts hand-place each visual inside `pbir_add_visual` instead.

---

## `pbir_list_pages({includeVisuals: true})`

Pass `includeVisuals: true` (or a `pageId`) to get pages + per-visual summaries in one call — saves round-trips over `pbir_list_pages` + N×`pbir_list_visuals`.

```json
// All pages with their visuals
{ "includeVisuals": true }

// Single page (implies includeVisuals)
{ "pageId": "<id>" }
```

Returns each page with `id`, `displayName`, `isActive`, `hidden`, `visualCount`, plus a slim `visuals` array of `{ id, type, x, y, w, h, title }` per visual. Use this as the default reconnaissance call whenever you also need to know what's on the canvas.

---

## `pbir_set_page_background`

Set the canvas background color and/or wallpaper (the area behind the canvas) for one page.

```json
{
  "pageId": "<id>",
  "color": "#0D1117",
  "transparency": 0,
  "wallpaperColor": "#000000",
  "wallpaperTransparency": 0
}
```

- `color` / `transparency` → canvas background (the page area itself)
- `wallpaperColor` / `wallpaperTransparency` → the area surrounding the canvas
- `transparency` is `0–100` (0 = opaque, 100 = fully transparent)
- Either layer is optional — pass only what you need
- Pass `clear: true` to remove both:
  ```json
  { "pageId": "<id>", "clear": true }
  ```

---

## `pbir_set_filter_pane`

Show/hide and expand/collapse the filter pane for the whole report (not per-page).

```json
{ "visible": true, "expanded": true }
```

Writes `objects.outspacePane` on the report. Hiding the filter pane is common for executive dashboards where you want a cleaner viewing experience and have already pre-filtered with `pbir_add_page_filter`.

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

`type`:
- `Filter` — selecting in source filters target (the standard cross-filter)
- `Highlight` — selecting in source highlights matching points in target while keeping the unfiltered context visible
- `NoFilter` — disable interaction entirely

The pair is stored in `page.visualInteractions` — re-calling with the same source/target updates the existing entry instead of duplicating it.

---

## `pbir_manage_extension_measures`

Add / list / remove report-level DAX measures (extension measures). Lets you define measures inside the thin report without touching the underlying semantic model.

```json
// List
{ "operation": "list" }

// Add
{
  "operation": "add",
  "tableName": "_Measures",
  "measureName": "Total Revenue",
  "expression": "SUM(Sales[Amount])",
  "dataType": "Double"
}

// Remove
{ "operation": "remove", "measureName": "Total Revenue" }
```

`dataType`: `Text` | `Double` | `Int64` | `Boolean` | `DateTime`. Defaults to `Text`.

> **Important:** an empty `reportExtensions.json` crashes Power BI Desktop. The tool auto-deletes the file when removing the last measure leaves nothing behind.

---

## Bookmarks

### `pbir_list_bookmarks`
```json
{}
```
Returns `{ count, bookmarks: [{ id, displayName }] }`.

### `pbir_add_bookmark`
```json
{
  "displayName": "Q4 View",
  "activePageId": "<pageId>"
}
```
Creates a bookmark with an empty exploration state. Open the report in Desktop to capture the current selection / filters / visibility into it.

### `pbir_rename_bookmark`
```json
{ "bookmarkId": "<id>", "displayName": "New Name" }
```

### `pbir_delete_bookmark`
```json
{ "bookmarkId": "<id>" }
```

---

## Common workflows

### Drillthrough page wired to a field
```
1. pbir_create_page displayName="Product Detail" drillthrough={entity:"Product", property:"Name"}
2. pbir_set_page_visibility hidden=true
3. pbir_add_visual actionButton x=20 y=660 buttonAction="back" buttonText="Back"
4. add data visuals — they inherit the drillthrough filter automatically
```

### Tooltip page
```
1. pbir_create_page displayName="Region Tooltip" type="tooltip"
2. pbir_add_visual card / chart inside the 320×240 canvas
3. pbir_format_visual on the source visual: visualHeaderTooltip → bind to this page
```

### Standard 3-page report
```
1. pbir_create_page "Overview"
2. pbir_create_page "Details"
3. pbir_create_page "Appendix"
4. pbir_set_active_page <overview>
5. pbir_reorder_pages [overview, details, appendix]
```

### Branded dark-mode dashboard
```
1. pbir_set_report_theme — apply brand palette
2. pbir_set_page_background color="#0D1117" wallpaperColor="#000000"
3. pbir_set_filter_pane visible=false   ← clean executive view
```

### Cross-filter only inside a panel
```
1. pbir_set_visual_interaction source=<chart> target=<unrelated KPI> type="NoFilter"
2. pbir_set_visual_interaction source=<chart> target=<related table>  type="Filter"
```

### Clone a template per region
```
1. pbir_list_pages → find the template id
2. pbir_duplicate_page sourceId=<template> displayName="Region: East"
3. pbir_update_visual_bindings on each duplicate to point at the right region
```

### Quick recon before editing
```
1. pbir_list_pages({includeVisuals: true})   ← one call, all pages + visuals
2. (decide what to change)
3. (apply edits)
```
