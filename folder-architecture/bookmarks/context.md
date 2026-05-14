# Bookmarks Context

## When this folder is loaded

Load this room only when managing bookmark CRUD. Bookmarks in PBIR are
exploration states (selections, filter values, sort order); the MCP can create
empty bookmarks and rename/delete them, but **the full exploration state must
be captured inside Power BI Desktop** — markdown and Node code alone cannot
introspect a running PBI Desktop session.

## Tools in this room

- `pbir_list_bookmarks` — Returns id + displayName, ordered
- `pbir_add_bookmark` — Create an empty bookmark (capture state in Desktop after)
- `pbir_rename_bookmark` — Change displayName
- `pbir_delete_bookmark` — Remove by ID

## Pipeline / ordering

1. `pbir_add_bookmark` with `displayName` and optional `activePageId`
2. Open the .pbip in Power BI Desktop, navigate to the desired view, capture state via the bookmark pane
3. `pbir_reload_report(confirm:true)` if the LLM needs to verify the captured state

## Cross-references

- Pairs with `pages/pbir_duplicate_page` for "save-points" workflows
- Reads `knowledge/report.md` for resource layout

## Gotchas

- Created bookmarks have empty `explorationState` — you can pin them to a page
  via `activePageId`, but selections/filters require Desktop capture.
- Deleted bookmarks are removed from `bookmarks.json` order AND the bookmark
  folder is dropped — no undo.
