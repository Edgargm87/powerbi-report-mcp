# Pages Context

## When this folder is loaded

Load this room when the task involves creating, listing, renaming, reordering,
or otherwise managing **the pages of a report** — the top-level canvas
containers. Skip when you're only working with visuals on an already-known
page (load `visuals/` instead).

## Tools in this room

- `pbir_create_page` — Create a standard, tooltip, or drillthrough page
- `pbir_delete_page` — Delete a page and all its visuals
- `pbir_rename_page` — Change a page's display name
- `pbir_list_pages` — Paginated list with optional embedded visual summaries
- `pbir_reorder_pages` — Set the page order (must be a permutation)
- `pbir_set_active_page` — Set which page opens by default
- `pbir_set_page_visibility` — Hide/show in the nav pane (drillthrough still works)
- `pbir_set_page_background` — Canvas + wallpaper color and transparency
- `pbir_update_page_size` — Width / height / displayOption
- `pbir_duplicate_page` — Deep clone, including all visuals
- `pbir_auto_layout` — Re-arrange existing visuals in a grid

## Pipeline / ordering

Typical first-page-of-report flow:

1. `pbir_create_page` (capture `pageId` and echoed `canvas` summary)
2. `layout/pbir_layout_grid` (planOnly:true then commit) — preferred over fanning
   out individual `pbir_add_visual` calls
3. `visuals/pbir_add_visual` for any visuals that don't fit a grid slot
4. `pbir_set_active_page` if not the first page

## Cross-references

- Reads `knowledge/pages.md` for page-type semantics
- Reads `knowledge/wireframes.md` for canvas geometry (1280×720, margins, gaps)
- Pairs with `layout/` for grid scaffolding and validation
- Pairs with `visuals/` for placing content on the page

## Gotchas

- **PageId auto-resolution**: most tools auto-resolve `pageId` when only one
  page exists. Pass it explicitly for multi-page reports.
- **Tooltip pages**: default to 320×240, `ActualSize` display, hidden from nav.
- **Drillthrough pages**: filter on `entity[property]` with `isAllFilter: true`.
- **Delete is unrecoverable** — `pbir_delete_page` drops the page folder and
  every visual under it; the active page falls back to the first remaining page.
- **Reorder is strict** — `pageOrder` must be a permutation (same length,
  same set, no duplicates) or the call fails before write.
