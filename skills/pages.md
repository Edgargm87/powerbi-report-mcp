# Skill: Pages — Page Management & Bookmarks

## Page Tools

| Tool | Purpose |
|---|---|
| `list_pages` | List all pages with id, displayName, size, visual count, active, hidden |
| `create_page` | Add a new page |
| `rename_page` | Rename a page |
| `delete_page` | Delete a page and all its visuals |
| `reorder_pages` | Set the page tab order |
| `set_active_page` | Set which page opens by default |
| `update_page_size` | Change width, height, displayOption |
| `set_page_visibility` | Show or hide a page from the navigation pane |
| `duplicate_page` | Clone a page with all its visuals |
| `auto_layout` | Arrange visuals in a grid on a page |

## Bookmark Tools

| Tool | Purpose |
|---|---|
| `list_bookmarks` | List all bookmarks |
| `add_bookmark` | Create a new bookmark |
| `rename_bookmark` | Rename a bookmark |
| `delete_bookmark` | Delete a bookmark |

---

## list_pages

Returns for each page:
```json
{
  "id": "<pageId>",
  "displayName": "Sales Overview",
  "width": 1280, "height": 720,
  "displayOption": "FitToPage",
  "visualCount": 12,
  "isActive": true,
  "hidden": false
}
```

---

## create_page

```json
{
  "displayName": "Executive Summary",
  "width": 1280,
  "height": 720,
  "displayOption": "FitToPage"
}
```

Defaults: 1280×720, FitToPage. Common sizes:
- Standard: 1280×720
- Portrait: 794×1122 (A4-ish)
- Narrow/sidebar: 400×720
- Wide: 1920×1080

---

## rename_page

```json
{ "pageId": "<id>", "displayName": "New Name" }
```

---

## delete_page

```json
{ "pageId": "<id>" }
```

Deletes the page folder and all its visuals. Irreversible. If the deleted page was active, the first remaining page becomes active.

---

## reorder_pages

```json
{ "pageOrder": ["<id1>", "<id2>", "<id3>"] }
```

Pass the full ordered array of all page IDs. Get current IDs from `list_pages`.

---

## set_active_page

```json
{ "pageId": "<id>" }
```

Sets which page is shown when the report opens.

---

## update_page_size

```json
{
  "pageId": "<id>",
  "width": 1280,
  "height": 720,
  "displayOption": "FitToPage"
}
```

`displayOption` values:
- `FitToPage` — scale to fit the whole page
- `FitToWidth` — scale to fit width, scroll vertically
- `ActualSize` — no scaling, scroll as needed

---

## set_page_visibility

```json
{ "pageId": "<id>", "hidden": true }
```

- `hidden: true` — page is hidden from the navigation pane (useful for drillthrough pages)
- `hidden: false` — page is visible

Hidden pages can still be navigated to via drillthroughs, buttons, or bookmarks.

---

## duplicate_page

```json
{
  "pageId": "<sourceId>",
  "displayName": "Copy of Sales"
}
```

Clones the page and all its visuals with new IDs. `displayName` defaults to `"Copy of <original>"`.

---

## auto_layout

Arranges all visuals on the page in a grid:

```json
{
  "pageId": "<id>",
  "columns": 3,
  "padding": 10,
  "marginTop": 10,
  "marginLeft": 10
}
```

Visuals are sized to fill the page evenly. Useful after adding multiple visuals without explicit positioning.

---

## Bookmarks

### list_bookmarks
```json
{}
```
Returns: `{ count, bookmarks: [{ id, displayName }] }`

### add_bookmark
```json
{
  "displayName": "Q4 View",
  "activePageId": "<pageId>"
}
```
Creates an empty bookmark. Open Power BI Desktop to capture the current view state into it.

### rename_bookmark
```json
{ "bookmarkId": "<id>", "displayName": "New Name" }
```

### delete_bookmark
```json
{ "bookmarkId": "<id>" }
```

---

## Common Workflows

### Create a drillthrough page
```
1. create_page: displayName="Product Detail", width=1280, height=720
2. set_page_visibility: hidden=true   ← hides from nav, still accessible via drillthrough
3. add_visual: add a back button (actionButton)
4. add data visuals filtered to the drillthrough field
```

### Add a report with 3 standard pages
```
1. create_page: "Overview"
2. create_page: "Details"
3. create_page: "Appendix"
4. set_active_page: Overview page
5. reorder_pages: [overview, details, appendix]
```

### Clone a page template
```
1. list_pages → find the template page id
2. duplicate_page: sourceId=<template>, displayName="Region: East"
3. duplicate_page: sourceId=<template>, displayName="Region: West"
4. update bindings on each duplicate to filter to the right region
```

### Create navigation bookmarks
```
1. add_bookmark: displayName="Sales View", activePageId=<salesPageId>
2. add_bookmark: displayName="Ops View", activePageId=<opsPageId>
3. Wire bookmarks to action buttons in Power BI Desktop
```
