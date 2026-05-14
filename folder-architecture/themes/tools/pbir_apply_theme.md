# pbir_apply_theme

> Apply a named theme preset to all visuals on a page. Themes: `dark`, `light`, `corporate`, `blue-purple`.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| theme | enum `dark` \| `light` \| `corporate` \| `blue-purple` | yes | — | |
| applyDataColors | boolean | no | true | Whether to apply the preset palette to charts |

## Output

```jsonc
{ "success": true, "pageId": "...", "theme": "dark", "visualsFormatted": N }
```

## Behavior

- This is NOT a theme write — it's a bulk per-visual format write.
- For each visual on the page:
  - Skips `NO_DATA_VISUAL_TYPES` (shapes/text/buttons/images)
  - Applies `preset.containerFormat` (or `slicerContainerFormat` for slicers)
  - Applies `preset.chartVisualFormat` for chart types
  - Applies `preset.dataColors` for chart types when `applyDataColors:true`
- Invalidates: `page:<id>` (per-iteration)

## Categorization note

Filed under `themes/` because of the name. Mechanically a bulk-format operation —
could live under `formatting/` or `bulk/`.

## Gotchas

- Doesn't touch the report theme JSON or report.json — every visual carries
  the override locally. `pbir_audit_theme_compliance` will surface this as
  drift if you later switch the report theme.
