# Filters Context

## When this folder is loaded

Load this room when adding, listing, or removing filters at page or visual
scope, or when controlling filter-pane visibility on the report canvas.

## Tools in this room

- `pbir_list_filters` — Page or visual filters, slim returns Table[Column]
- `pbir_add_page_filter` — Add categorical / topN / relativeDate / advanced
- `pbir_remove_filter` — Remove by filter name (from `pbir_list_filters`)
- `pbir_clear_filters` — Drop ALL filters at the chosen scope
- `pbir_set_filter_pane` — Show/hide/expand the report's filter pane (page chrome)

## Pipeline / ordering

1. `pbir_list_filters` to see what's already in place
2. `pbir_add_page_filter` to add (omit visualId for page-level; topN requires visualId)
3. `pbir_remove_filter` or `pbir_clear_filters` for cleanup

## Cross-references

- Reads `knowledge/filters.md` for filter-type semantics + PBIR JSON shapes
- Pairs with `visuals/pbir_set_visual_interaction` for cross-filter behavior

## Gotchas

- **topN requires `visualId`** — page-level topN isn't valid PBIR.
- **Categorical filters use From/Where DAX**, NOT `{ Categorical: {} }` — the
  helper builds this; doc here for transparency.
- **RelativeDate** uses `DateAdd`/`DateSpan` expressions (`TimeUnit: years=3`).
  Quarters are months × 3.
- **Advanced** supports `Equals/NotEquals/GreaterThan(OrEqual)/LessThan(OrEqual)/
  Contains/DoesNotContain/StartsWith/DoesNotStartWith/IsBlank/IsNotBlank` with
  optional `And`/`Or` compound (2 conditions max).
- **filter-pane note**: `pbir_set_filter_pane` operates on the *report* report.json,
  not per-page. It's filed in `filters/` because it gates filter UI; could
  equally live in `pages/`.
