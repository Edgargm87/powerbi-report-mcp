# Formatting Context

## When this folder is loaded

Load this room when applying ad-hoc per-visual formatting (title, axes, legend,
background, padding) after a visual already exists. Skip when:

- You can set the format inline at create time → `visuals/pbir_add_visual` with
  `containerFormat`/`visualFormat`
- You want report-level style → `themes/`
- You want the same format on many visuals → `bulk/pbir_bulk_update_format`

## Tools in this room

- `pbir_format_visual` — Apply a `FormatCategory[]` payload to one visual

(Closely related but filed elsewhere: `pbir_set_visual_title`, `pbir_apply_theme`,
`pbir_set_datapoint_colors`, `pbir_set_conditional_format`, `pbir_bulk_update_format`.)

## Pipeline / ordering

1. `meta/pbir_lookup_theme_property` to find valid `(category, property)` pairs for the visualType
2. `pbir_format_visual` with target:'auto' (default)
3. `themes/pbir_audit_theme_compliance` to surface what you just overrode

## Cross-references

- Reads `knowledge/formatting.md` for the FormatCategory payload structure
- Reads `knowledge/themes-per-visual.md` for which categories per visualType
- Pairs with `themes/pbir_lookup_theme_property` for property discovery

## Gotchas

- **target='auto'** routes `title`/`subTitle`/`background`/`border`/`padding`/
  `dropShadow`/`visualHeader`/`visualHeaderTooltip` to `visualContainerObjects`
  and everything else to `objects`. Force with `target='container'` or
  `target='visual'` if needed.
- **Typo catcher runs first** — `'fontFmaily'` returns `error: "format_typo"`
  with a Levenshtein-suggested `didYouMean` before any write.
- **slicer uses `textSize`, not `fontSize`** for items/header.
- **waterfall uses `sentimentColors`, not `dataPoint`**.
