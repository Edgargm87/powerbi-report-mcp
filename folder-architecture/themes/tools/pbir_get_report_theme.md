# pbir_get_report_theme

> Get the currently applied theme. Returns base theme name + custom theme JSON if any.

## Inputs

No parameters.

## Output

```jsonc
{
  "baseTheme": "CY24SU10" | null,
  "customTheme": "Name1700000000000.json" | null,
  "customThemeContent": { /* parsed JSON */ } | null
}
```

## Behavior

- `readOnlyHint: true`
- Cached on `theme` scope
- Reads the registered-resource file when a custom theme is set
