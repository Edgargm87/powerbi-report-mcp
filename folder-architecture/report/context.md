# Report Context

## When this folder is loaded

Load this room at session start (binding to a report) and any time you need
report-level settings, the reload-PBI workflow, or semantic-model
cross-referencing. Skip when you're operating within an already-bound report
on visuals/pages.

## Tools in this room

- `pbir_set_report` — Bind to a `.Report` folder or `.pbip` project root
- `pbir_get_report` — Show current binding + `hasSemanticModel:boolean`
- `pbir_get_report_settings` — Report-level settings JSON
- `pbir_update_report_settings` — Merge whitelisted settings
- `pbir_reload_report` — Kill + relaunch PBI Desktop (destructive)
- `pbir_model_usage` — Cross-reference report vs `.SemanticModel/`

## Pipeline / ordering

Session start:

1. `pbir_set_report(path)` — receives the connect-time banner with skills index
2. `pbir_get_report` to check `hasSemanticModel` BEFORE calling `pbir_model_usage`
3. `pbir_model_usage(slim:true)` for an unused-fields scan

Reload (rare, destructive):

1. Save unsaved Desktop work first
2. `pbir_reload_report(confirm:true)`
3. `pbir_model_usage` again to confirm modeling changes survived

## Cross-references

- Reads `knowledge/report.md` for `.Report`/.SemanticModel layout
- Reads `knowledge/report-design.md` for delivery-readiness criteria
- Pairs with `meta/` for session-orient tools

## Gotchas

- **`pbir_reload_report` taskkills `PBIDesktop.exe`** — unsaved work is lost.
  Requires `confirm:true`; without it returns a structured save-first warning.
- **`hasSemanticModel`** is the gate for `pbir_model_usage`. A live-connect
  report has no sibling `.SemanticModel/` — calling model_usage there returns
  a clean fail, not a throw.
- **Valid settings keys** (whitelist enforced):
  `useStylableVisualContainerHeader`, `exportDataMode`, `defaultDrillFilterOtherVisuals`,
  `allowChangeFilterTypes`, `useEnhancedTooltips`, `useDefaultAggregateDisplayName`,
  `isPaginatedReportMode`, `hideVisualContainerHeader`, `useNewFilterPaneExperience`,
  `optOutNewFilterPaneExperience`, `persistentFilters`, `keyboardNavigationEnabled`.
