# pbir_set_report_theme

> Apply a custom JSON theme. Hex colors. `dataColors` 6-12 values. `visualStyles` keyed by visualType or `*`.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| name | string | yes | Theme name (becomes part of filename) |
| dataColors | string[] | no | 6-12 hex strings |
| background | string | no | Hex |
| foreground | string | no | Hex |
| foregroundNeutralSecondary | string | no | Hex |
| backgroundLight | string | no | Hex |
| backgroundNeutral | string | no | Hex |
| tableAccent | string | no | Hex |
| visualStyles | `Record<string, unknown>` | no | Keyed by visualType or `*` |

## Output

```jsonc
{ "success": true, "message": "Theme \"...\" applied to report", "filename": "Name1700000000000.json", "themeKeys": ["name","dataColors","background"] }
```

## Behavior

- `idempotentHint: true`
- Writes theme JSON to `StaticResources/RegisteredResources/{safeName}{ts}.json`
- Upserts `themeCollection.customTheme` and `resourcePackages` in report.json
- Removes any prior `CustomTheme` entries before adding the new one
- Invalidates: `theme`

## Gotchas

- Filename includes a millisecond timestamp; the previous custom-theme file is
  NOT deleted from disk (use `pbir_list_report_themes` to find old ones).
- `reportVersionAtImport` is hardcoded to the current PBIR versions (visual
  2.7.0, report 3.2.0, page 2.3.0).

## See also

- `knowledge/themes.md`
- `pbir_lookup_theme_property.md` (in `meta/` — actually filed under themes too: lives here)
