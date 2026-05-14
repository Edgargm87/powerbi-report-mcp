# pbir_remove_report_theme

> Remove the custom theme from the report, reverting to the default base theme. The theme file is kept in StaticResources but unlinked from report.json.

## Inputs

No parameters.

## Output

```jsonc
{ "success": true, "message": "Custom theme \"...\" removed", "removedTheme": "..." }
```

## Behavior

- `destructiveHint: true`
- Deletes `themeCollection.customTheme` and prunes `resourcePackages.items` of every `CustomTheme` entry
- File on disk is preserved — `pbir_list_report_themes` still shows it

## Gotchas

- Re-applying later requires `pbir_set_report_theme` with the same theme JSON
  (file path alone isn't enough — the tool always writes a fresh timestamped file).
