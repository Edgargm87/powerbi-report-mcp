# pbir_update_report_settings

> Merge report-level settings.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| settings | `Record<string, unknown>` | yes | Whitelisted keys only |

Valid keys: `useStylableVisualContainerHeader`, `exportDataMode`,
`defaultDrillFilterOtherVisuals`, `allowChangeFilterTypes`, `useEnhancedTooltips`,
`useDefaultAggregateDisplayName`, `isPaginatedReportMode`,
`hideVisualContainerHeader`, `useNewFilterPaneExperience`,
`optOutNewFilterPaneExperience`, `persistentFilters`, `keyboardNavigationEnabled`.

## Output

```jsonc
{ "success": true, "settings": { /* merged result */ } }
```

## Validation

Invalid keys → fail with the full valid-keys list in the error message.

## Behavior

- `idempotentHint: true`
- Merge semantics (existing keys preserved unless overwritten)
- Invalidates: `report`
