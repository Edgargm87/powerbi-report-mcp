# Themes Context

## When this folder is loaded

Load this room when the task is *report-level* visual style: applying a custom
JSON theme, listing existing themes, looking up valid style properties, or
auditing visuals for theme overrides. Skip when the work is per-visual
formatting (load `formatting/`) or pure data binding (load `visuals/`).

## Tools in this room

- `pbir_set_report_theme` — Apply a custom JSON theme (writes RegisteredResource + report.json)
- `pbir_get_report_theme` — Return current theme (base + custom)
- `pbir_remove_report_theme` — Unlink the custom theme (file kept on disk)
- `pbir_list_report_themes` — List theme files in `StaticResources/RegisteredResources/`
- `pbir_diff_report_theme` — Preview changes against currently applied theme
- `pbir_apply_theme` — Apply a *named preset* (`dark`/`light`/`corporate`/`blue-purple`) to every visual on a page
- `pbir_audit_theme_compliance` — Find per-visual overrides (theme drift)
- `pbir_lookup_theme_property` — Walk the bundled PBI theme schema for valid property names

## Pipeline / ordering

Theme-from-scratch:

1. `pbir_lookup_theme_property` (no args) to find valid visualTypes
2. `pbir_lookup_theme_property(visualType, category)` for each surface you want to style
3. `pbir_diff_report_theme` to preview before applying
4. `pbir_set_report_theme` to apply
5. `pbir_audit_theme_compliance` per page to find visuals overriding the theme

## Cross-references

- Reads `knowledge/themes.md` for theme JSON structure
- Reads `knowledge/themes-per-visual.md` for which properties per visualType
- Reads `knowledge/formatting.md` for the per-visual override surface
- Pairs with `formatting/` for the override side of the contract

## Gotchas

- **Preset `pbir_apply_theme` is NOT a theme** — it's a bulk per-visual format
  write. It doesn't write the theme file or update report.json. Use it for a
  quick consistent look across visuals; use `pbir_set_report_theme` for a real
  theme.
- **Inline formatting overrides the theme** — `containerFormat`/`visualFormat`
  on `pbir_add_visual`, and `pbir_format_visual`, both win over the theme.
  `pbir_audit_theme_compliance` is how you find drift.
- **`pbir_remove_report_theme` keeps the file** — unlinks from report.json but
  leaves the JSON in StaticResources. Use it for revertable theme experiments.
