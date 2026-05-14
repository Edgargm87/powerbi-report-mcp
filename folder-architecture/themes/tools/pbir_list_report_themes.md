# pbir_list_report_themes

> List all theme files stored in the report's `StaticResources/RegisteredResources/` folder.

## Inputs

No parameters.

## Output

```jsonc
{ "themeFiles": [ { "filename": "...", "name": "...", "keys": ["dataColors","background"] } ] }
```

## Behavior

- `readOnlyHint: true`
- Returns every `.json` file in the registered resources folder, parsed for `name` + key list
