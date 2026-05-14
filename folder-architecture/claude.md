# Power BI Report MCP — Folder Architecture View

This folder mirrors the entire `powerbi-report-mcp` server (56 tools + 17 skills)
as the 3-Layer Folder Architecture pattern. It is a **representation**, not the
running server — the real MCP lives in `src/` and ships as Node code with
validators, caching, and atomic file ops that markdown alone cannot replicate.

See `README.md` for what this folder is for.

## Layer 2 rooms

| Room | Purpose | Tool count |
|------|---------|-----------:|
| `pages/` | Page management — create, list, rename, reorder, settings | 10 |
| `visuals/` | Visual CRUD + per-visual config (title, sort, interaction, colors) | 13 |
| `themes/` | Report-level theme management + lookup + audit | 8 |
| `formatting/` | Format payload application | 1 |
| `filters/` | Page/visual filter management + pane visibility | 5 |
| `bookmarks/` | Bookmark CRUD | 4 |
| `bulk/` | Batch operations (bind, delete, format) | 3 |
| `layout/` | Layout grid scaffolding + wireframe validation | 2 |
| `calculations/` | Visual calculations + report-level extension measures | 4 (3 PARKED) |
| `report/` | Report binding, settings, model-usage cross-ref | 6 |
| `meta/` | Guide / tool discovery / visual type catalog | 3 |
| `knowledge/` | Shared cross-cutting skills (the 17 `pbir_guide` topics) | — |

Total: 56 active tools. (3 PARKED visual-calculation tools are documented for
completeness but `registerCalculationTools` is commented out in `src/index.ts`
as of v0.9.6 — they're not exposed to clients.)

Note: `pbir_set_filter_pane` is grouped under `filters/` because it controls
filter UI; it lives in `report.ts` and could equally live under `pages/`. See
"Categorization caveats" below.

## Routing table — what to load per task

| Task | Read first | Skip | Tools to invoke |
|------|------------|------|-----------------|
| Build a new page from scratch | knowledge/wireframes.md, knowledge/visuals.md, knowledge/report-design.md, layout/context.md, visuals/context.md | themes/, calculations/, bookmarks/ | pages/tools/pbir_create_page.md → layout/tools/pbir_layout_grid.md → visuals/tools/pbir_add_visual.md |
| Add slicers to a page | knowledge/slicers.md, visuals/context.md, filters/context.md | themes/, layout/, calculations/ | visuals/tools/pbir_add_visual.md (slicer type) → optionally filters/tools/pbir_add_page_filter.md |
| Theme an existing report | knowledge/themes.md, knowledge/themes-per-visual.md, themes/context.md, formatting/context.md | wireframes, layout/, bookmarks/ | themes/tools/pbir_set_report_theme.md → themes/tools/pbir_audit_theme_compliance.md |
| Bind data to existing visuals | knowledge/visuals.md, visuals/context.md, bulk/context.md | themes/, layout/, bookmarks/ | visuals/tools/pbir_update_visual_bindings.md OR bulk/tools/pbir_bulk_bind.md |
| Diagnose layout problems | knowledge/wireframes.md, knowledge/errors.md, layout/context.md | themes/, calculations/, bookmarks/ | layout/tools/pbir_validate_wireframe.md (scope:report) |
| Cleanup before delivery | knowledge/post-edit-checklist.md, knowledge/report-design.md, themes/context.md | layout/, calculations/ | layout/tools/pbir_validate_wireframe.md → themes/tools/pbir_audit_theme_compliance.md → report/tools/pbir_get_report_settings.md |
| Investigate semantic model dependencies | knowledge/report.md, report/context.md | wireframes, layout/, themes/ | report/tools/pbir_model_usage.md (BEFORE any delete) |
| Manage bookmarks | bookmarks/context.md | most other rooms | bookmarks/tools/* |

## Default vs on-demand tools

The real MCP starts with only **13 default tools** (see `src/default-tools.ts`):

```
pbir_set_report, pbir_list_pages, pbir_list_visuals, pbir_create_page,
pbir_add_visual, pbir_get_visual, pbir_format_visual, pbir_update_visual_bindings,
pbir_set_report_theme, pbir_bulk_bind, pbir_model_usage, pbir_reload_report,
pbir_lookup_theme_property
```

Everything else is registered as deferred and activated via `pbir_load_tools`.
This folder ignores the default-vs-deferred split — every tool gets its own
file regardless of activation state.

## How the layers actually work in the real MCP

- **Layer 1 (this `claude.md`)** ≈ `skills/_overview.md` shipped at MCP startup
  as the `pbir-instructions` resource and via the connect-time banner from
  `buildSkillsIndexBanner()`
- **Layer 2 (per-room `context.md`)** ≈ deferred skills loaded on demand via
  `pbir_guide(topic)`
- **Layer 3 (per-tool MD)** ≈ the `registerTool` description + zod
  inputSchema/outputSchema + handler. The MD files here are what the LLM "sees"
  from each tool registration

## Important: what these MD files describe vs what the real MCP does

The tool MDs here describe **the contract** (inputs, outputs, behavior, gotchas).
The real MCP additionally enforces:

- **Inventory-based binding validation** — every `Sales[Net Price]` is checked
  against the live `.SemanticModel/` inventory before the visual is written.
  Markdown can describe "validation happens"; it can't run the lookup.
- **Layout-validator math** — margins, gaps, overlap, off-canvas, banner
  geometry. Implemented in `src/wireframe-validator.ts` with real coordinate
  arithmetic. Markdown can encode the rules; only code enforces them.
- **Format property typo catcher** — Levenshtein over the 1.2 MB bundled PBI
  theme schema. Catches `'fontFmaily'` → suggests `'fontFamily'` before write.
- **Theme schema lookup** — `pbir_lookup_theme_property` walks the 1.2 MB JSON
  schema to surface valid property names per visualType.
- **Atomic file writes + cache invalidation** — `readCache` invalidates scopes
  (`report`, `pages`, `page:<id>`, `theme`, `bookmarks`) on every mutation so
  the next read returns fresh JSON.
- **PBI Desktop process integration** — `pbir_reload_report` taskkills
  PBIDesktop.exe and relaunches the .pbip file. No markdown stand-in.
- **Auto-resolution of measure home tables** — when a binding references a
  measure on the wrong entity, the code resolves it via the inventory and
  reports the correction in `bindingAutoCorrections`. Markdown can document
  the behavior; it can't perform the lookup.
- **Dual-emit `content` + `structuredContent`** for backwards compat with
  text-only clients and forwards compat with structured-output clients.

These are NOT replicable in markdown. The folder view is a **representation**,
not an implementation.

## Categorization caveats

A few tools sit on room boundaries — the choice in this folder is one valid
read, not the only one:

- `pbir_set_filter_pane` — lives in `report.ts`, controls report chrome
  visibility. Filed under `filters/` here, but a "page chrome" reading would
  put it under `pages/`.
- `pbir_set_visual_interaction` — cross-filter behavior (Filter / Highlight /
  NoFilter) between visuals. Filed under `visuals/` because the contract
  takes `source` and `target` visual IDs; could equally live in `filters/`.
- `pbir_manage_extension_measures` — report-level DAX (`reportExtensions.json`).
  Filed under `calculations/` alongside visual calculations even though it's a
  report-scope tool; the alternative is `report/`.
- `pbir_apply_theme` — applies a *named preset* to every visual on a page (no
  theme JSON involved). Filed under `themes/` because of the name, but
  mechanically it's a bulk format-write — could live in `bulk/` or `formatting/`.
