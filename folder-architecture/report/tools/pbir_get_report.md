# pbir_get_report

> Show the currently connected report path. Includes `hasSemanticModel: boolean` — true when a sibling `.SemanticModel/` folder exists. Check this before calling `pbir_model_usage`.

## Inputs

No parameters.

## Output

```jsonc
{ "reportPath": "C:\\path\\to\\Foo.Report" | "No report connected", "hasSemanticModel": true }
```

## Behavior

- `readOnlyHint: true`
- Cached on `report` scope
- `hasSemanticModel` swallows the noisy throw from a broken `definition.pbir` pointer
