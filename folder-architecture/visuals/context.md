# Visuals Context

## When this folder is loaded

Load this room when working with individual visuals on a page — creating,
binding data, formatting, sorting, positioning, or changing types. Skip when
the task is theme-wide (load `themes/`) or layout-wide (load `layout/`).

## Tools in this room

- `pbir_get_visual_types` — Catalog of available visualTypes
- `pbir_list_visuals` — Paginated list, optional `visualType` filter
- `pbir_get_visual` — Single visual details (slim default, verbose for full PBIR)
- `pbir_add_visual` — Batch-add visuals with inline bindings/format (the workhorse)
- `pbir_delete_visual` — Remove a visual
- `pbir_move_visual` — Reposition / resize a visual
- `pbir_duplicate_visual` — Clone (same page or cross-page)
- `pbir_change_visual_type` — Switch type while keeping bindings
- `pbir_update_visual_bindings` — Replace bindings on an existing visual
- `pbir_set_visual_title` — Title text, show/hide, font
- `pbir_set_visual_sort` — Override auto-sort
- `pbir_set_visual_interaction` — Cross-filter type (Filter/Highlight/NoFilter)
- `pbir_set_datapoint_colors` — Per-series or per-category colors
- `pbir_set_conditional_format` — Rules / gradient on background or title

## Pipeline / ordering

Add-from-scratch:

1. `pbir_get_visual_types` (if uncertain about types)
2. `pbir_lookup_theme_property` for valid format property names
3. `pbir_add_visual` with inline `bindings`, `containerFormat`, `visualFormat`,
   `dataColors` to avoid follow-up calls
4. `pbir_validate_wireframe` after a batch to confirm layout

Modify-existing:

1. `pbir_get_visual` (slim) to inspect
2. `pbir_update_visual_bindings` or `pbir_format_visual` (the latter lives in
   `formatting/`)
3. `pbir_set_visual_title` / sort / colors as needed

## Cross-references

- Reads `knowledge/visuals.md` for visualType selection
- Reads `knowledge/slicers.md` for slicer-specific bucket and selection logic
- Reads `knowledge/shapes.md` for shape/rectangle/line specifics
- Reads `knowledge/svg-visuals.md` for image visuals
- Reads `knowledge/themes-per-visual.md` for which format properties belong on which visualType
- Pairs with `formatting/` for `pbir_format_visual`, `pbir_apply_theme`
- Pairs with `bulk/` for fan-out across many visuals
- Pairs with `layout/` for placement math

## Gotchas

- **Single-mode removed in v0.8.0** — `pbir_add_visual` requires
  `visuals: [...]` even for one visual.
- **Stacked charts need a Series binding** — otherwise PBI silently renders as
  clustered.
- **Scatter uses `Category` bucket, not Axis** — common error class.
- **KPI card** = `visualType: "card"` with one measure in `Values`.
- **Slicer textSize, not fontSize** — `items`/`header` categories use `textSize`.
- **Waterfall uses `sentimentColors`, not `dataPoint`** — different category name.
- **Measure home-table auto-resolution** — surfaces in `bindingAutoCorrections`
  when a measure was bound on the wrong entity but only one home table matches.
- **Layout validator runs before write** — set `strictLayout:false` to proceed
  with warnings instead of fail.
