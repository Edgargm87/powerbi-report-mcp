# Power BI Report (PBIR) Format Guide

You are working with Power BI reports in the PBIR (Power BI Report) format — a folder-based JSON structure.

## Report Structure
```
{Name}.Report/
├── definition/
│   ├── report.json          # Report settings, themes, visual styles
│   ├── version.json         # Format version
│   ├── pages/
│   │   ├── pages.json       # Page order and active page
│   │   └── {pageId}/
│   │       ├── page.json    # Page display name, size, options
│   │       └── visuals/
│   │           └── {visualId}/
│   │               └── visual.json  # Visual type, position, data bindings, filters
│   └── reportExtensions.json # Extension measures (report-level DAX) — DELETE if empty
├── CustomVisuals/           # Private custom visuals (optional)
├── definition.pbir          # Reference to the semantic model (byPath for local PBIP, byConnection for remote/thin report)
└── StaticResources/         # Themes and static assets
```

**definition.pbir** has two connection variants:
- `byPath` — local PBIP project, references a relative path like `../MyModel.SemanticModel`
- `byConnection` — remote/thin report with a connection string to a published dataset

## Knowledge layer — call `pbir_guide(topic)`
For visualType names, bucket bindings, canvas/layout rules, and formatting gotchas, call
`pbir_guide(topic)` — topics are discovered live from skills/*.md (wireframes, visuals, slicers,
formatting, themes, themes-per-visual, shapes, filters, svg-visuals, calculations, pages,
report-design, report, elicitation, token-usage). Start with `pbir_guide("wireframes")` when
building a fresh page; canvas constants and layout formulas live there.

## Unsupported / non-obvious surface
- **Visual interactions** — `pbir_set_visual_interaction` for cross-filter/cross-highlight (`visualInteractions` in page.json).
- **Sort definitions** — `sortDefinition` in visual query controls default sort order. Not exposed as a tool.
- **Extension measures** — `pbir_manage_extension_measures` for report-level DAX (`reportExtensions.json`). WARNING: file auto-deletes when empty; empty `entities: []` crashes PBI Desktop.
- **Bookmarks** — `pbir_list_bookmarks`, `pbir_add_bookmark`, `pbir_delete_bookmark`, `pbir_rename_bookmark`.
- **Filter pane visibility** — `pbir_set_filter_pane` (`objects.outspacePane` in report.json).

## Tips
- Batch `pbir_add_visual` via the `visuals` array to create multiple visuals in one call.
- When building a fresh page from scratch, prefer `pbir_layout_grid` with `planOnly:true` over guessing pixel coords. The server computes exact x/y/w/h per cell (remainder distributed), so the layout is guaranteed to pass strict validation.
- `pbir_duplicate_visual` clones and is often faster than re-specifying a near-duplicate.
