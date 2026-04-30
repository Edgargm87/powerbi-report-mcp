<!-- doc-version: 1.1 | Last updated: 2026-04-27 -->
# Backlog — powerbi-report-mcp

Forward-looking work, organised by likely version. Each item lists evidence
(where the idea came from) so future-you can re-evaluate priority.

---

## v0.9.2 — small polish (no breaking changes)

Surfaced by **Claude Opus during the v0.9.1 release-gate eval run** as
genuine UX wins. Each tries to remove a paper-cut where the agent had to
work around a missing field or call shape. None are blockers; all should
land together as one minor patch.

| # | Item | Evidence | Effort |
|---|------|----------|-------:|
| 1 | `pbir_list_pages` slim mode includes `width`/`height` | Eval task 1 — agent had to call `slim:false` just to get canvas dimensions, a common quick lookup | XS |
| 2 | `pbir_list_pages` response gains top-level `totalVisualCount` | Eval task 2 — agent had to client-side sum `visualCount` per page | XS |
| 3 | `pbir_list_visuals` accepts optional `visualType` filter | Eval tasks 3, 4 — both required cross-page sweeps; a single filtered call would replace N calls | S |
| 4 | `pbir_list_pages` description highlights `includeVisuals: true` as the canonical cross-page query pattern | Eval tasks 3, 4 — agent picked parallel `pbir_list_visuals` over the single-call `includeVisuals` form. Description-only change | XS |
| 5 | `pbir_get_report` includes `hasSemanticModel: boolean`; `pbir_model_usage` description names the `.SemanticModel` precondition | Eval task 9 — agent had to invoke the full `pbir_model_usage` tool just to discover there was no model | XS |
| 6 | Add the 3 `<!-- TODO: add screenshot -->` markers (hero, batch, plugin install) to actual screenshots in README.md | Tracked since v0.8.2 | S (manual) |
| 7 | New skill `skills/post-edit-checklist.md` — port the 7-step "Mandatory Post-Edit Visibility Checklist" pattern from pbi-pilot's SKILL.md (page registered in pageOrder, visual folders exist on disk, filter mechanism in correct file, bindings reference valid model fields, run validator with 0 errors, refresh, post-refresh re-check). The LLM consults it after batches of edits. Cheap, immediate value | [pbi-pilot SKILL.md](https://github.com/TemplateMechanics/pbi-pilot/blob/main/skills/powerbi-pbip/SKILL.md) §"Mandatory Post-Edit Visibility Checklist (PBIR)" | XS |
| 8 | Add `queryState` role lookup table at the top of `skills/visuals.md` (`clusteredBarChart` → `Category`+`Y`, `card`/`slicer` → `Values`, `tableEx` → `Values`, `pivotTable` → `Rows`+`Columns`+`Values`, etc). Data already exists in `src/pbir.ts VISUAL_BUCKETS` — just surface as a quick-reference table for faster LLM lookup | pbi-pilot SKILL.md §"queryState role mapping by visual type" — they have it as a clean table; we have it scattered | XS |
| 9 | Add 3 PBI Desktop quirks to `docs/pbir-gotchas.md`: (a) `enableAutoRecovery: false` workaround when PBI Desktop's auto-recovery masks fresh PBIR file changes; (b) "Visuals not appearing after restart" troubleshooting prose; (c) `filters: []` empty-array warning vs `filterConfig` schema-version-specific guidance | pbi-pilot SKILL.md §"Troubleshooting" + "CRITICAL — Common Visual Mistakes" | XS |

Acceptance: bumps to v0.9.2, all tests still green, eval still 10/10 on
Opus, plugin v0.3.2.

---

## v0.10.0 — wireframe scaffolder v2 + new tool

Surfaced by the **wireframe scaffolder artifact** work in v0.9.0 addendum.
The artifact has a parked "warnings footer" feature because the validator
can't be reached over the MCP wire.

| # | Item | Evidence | Effort |
|---|------|----------|-------:|
| 1 | New tool `pbir_validate_wireframe({ pageId? })` exposing `src/wireframe-validator.ts` over MCP. Returns `{ errors: [...], warnings: [...] }` per visual on the active page (or specified page) | Artifact v1 v2 follow-up — currently the artifact would have to duplicate ~380 lines of validator logic client-side | M |
| 2 | Wire the new tool into the wireframe scaffolder artifact's Inspect tab footer (clickable warnings highlight the offending visual on the SVG canvas) | Same evidence | M (artifact-side, no `src/`) |
| 3 | Extract the 5 canonical layouts to a real `CANONICAL_LAYOUTS` export in `src/wireframe-validator.ts` (the v1 artifact agent expected this and had to fall back to extracting from `skills/wireframes.md` + `scripts/test-wireframe-validator.js`) | Wireframe scaffolder probing report | S |
| 4 | Bindings UI in the wireframe scaffolder modal — model field picker, fed by `pbir_model_usage` field inventory | Spec'd as deferred in artifact v1 ("we'll know if it's worth building once people use v1") | L |
| 5 | New tool `pbir_verify_project({ pageId? })` — runs the 7-step post-edit checklist (from v0.9.2 item 7) programmatically, returns `[{check, passed, details}]`. Pairs naturally with `pbir_validate_wireframe` above (both are "give me actionable verification across the whole project" tools). Once this exists, the skill version (v0.9.2 item 7) can either stay as guidance or get slimmed to "call `pbir_verify_project` after edits" | pbi-pilot SKILL.md §"Mandatory Post-Edit Visibility Checklist" promoted from skill to MCP tool | M |

Acceptance: bumps to v0.10.0, validator output makes warnings visible
where they're actionable (in the artifact, on the canvas).

---

## v0.11.0+ — macros (orchestrator tools)

Surfaced in the **earlier "MCP optimal adjustments" discussion**. Idea:
common configuration patterns currently require the agent to make 3-5
atomic tool calls; bundle them into single macro tools so skills become
"orchestrators of intent" rather than recipes.

| # | Item | Evidence | Effort |
|---|------|----------|-------:|
| 1 | `pbir_apply_brand_kit({ primary, secondary, fontFamily })` — bundles `pbir_set_report_theme` + foreground/background defaults + `pbir_audit_theme_compliance` | Theming workflow | M |
| 2 | `pbir_setup_filter_navigation({ mode: "pane" \| "slicer-page" \| "both" })` — bundles `pbir_set_filter_pane` + optional slicer page creation + `pbir_add_page_filter` defaults | Filter setup workflow | M |
| 3 | `pbir_apply_report_preset("executive" \| "operational" \| "analytical")` — bundles theme + page size + filter pane + canvas defaults for first-time scaffolding | Report preset workflow | M |

Wait for usage data before building these. The original recommendation
was: ship v0.9.0 + Cowork plugin, see what users actually orchestrate
manually, then macro-ify the most-repeated sequences. Don't pre-design.

---

## Backlog hygiene

- When an item ships, **delete it from this file** and ensure the change is
  reflected in `CHANGELOG.md` / `changelog/<version>.md`.
- New ideas land here, not in the changelog. Don't bloat the changelog
  with speculation.
- If an item sits in the backlog for >2 minor versions without progress,
  re-evaluate whether it's actually wanted.
