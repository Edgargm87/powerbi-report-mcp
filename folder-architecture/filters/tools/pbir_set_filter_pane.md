# pbir_set_filter_pane

> Show or hide the filter pane.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| visible | boolean | yes | — | |
| expanded | boolean | no | true | |

## Output

```jsonc
{ "success": true, "filterPane": { "visible": true, "expanded": true } }
```

## Behavior

- `idempotentHint: true`
- Writes `report.objects.outspacePane[0].properties.{visible,expanded}` as PBIR literal expressions
- Invalidates: `report`

## Categorization note

Lives in `report.ts` and gates report-level page chrome. Filed under `filters/`
because it controls filter UI; could equally live under `pages/`.
