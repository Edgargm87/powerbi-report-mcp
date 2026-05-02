<!-- doc-version: 1.0 | Last updated: 2026-05-02 -->
<!-- summary: Mandatory 7-step verification after batches of PBIR edits — page registration, visual folders on disk, filter mechanism in correct file, valid bindings, validator-clean, refresh PBI Desktop, post-refresh re-check. Read after every batch of pbir_add_visual / pbir_create_page / pbir_add_page_filter / pbir_set_report_theme. -->
# Skill: Post-Edit Visibility Checklist (PBIR)

## When to use
After **every** batch of PBIR edits — adding pages, adding visuals, adding/removing filters, theming changes — run this checklist before declaring the work complete. Catches the silent-failure modes where the JSON looks right but PBI Desktop never renders the change.

Adapted from the [pbi-pilot SKILL.md](https://github.com/TemplateMechanics/pbi-pilot/blob/main/skills/powerbi-pbip/SKILL.md) "Mandatory Post-Edit Visibility Checklist (PBIR)" pattern. Our equivalents of pbi-pilot's PowerShell scripts are MCP tool calls.

## The 7 checks

1. **Verify page registration.** Each page folder exists and is listed in `definition/pages/pages.json` `pageOrder`. The fast in-session probe is `pbir_list_pages({ slim: true })` — every page you expected must appear, and `isActive` must point at the page you intended to be the entry point.

2. **Verify visual folders exist on disk.** For every expected visual, the file `definition/pages/<page>/visuals/<visualId>/visual.json` must exist. Use `pbir_list_pages({ includeVisuals: true })` (single round-trip) or `pbir_list_visuals({ pageId })` per page — the count and types must match what you intended to create.

3. **Verify requested filter mechanisms are in the correct file.** If a page is meant to have interactive filtering, confirm `page.json` carries the filter:
   - schema 2.1.0+ → `filterConfig.filters[]` (preferred for new work)
   - schema 1.0.0  → top-level `filters[]` (legacy)
   Match the format that the rest of the project already uses; do NOT mix formats within a project. Report-level filters live in `definition/report.json`. Slicer filters live on the visual itself (`visuals/<id>/visual.json`). Use `pbir_list_filters` to confirm. Do not claim a filter was added if it only exists in plan text.

4. **Verify field bindings reference valid model fields.** Every binding (page filter, report filter, slicer projection, visual `queryState`) must reference an `Entity` + `Property` that actually exists in the semantic model. The `pbir_add_visual` / `pbir_add_page_filter` / `pbir_bulk_bind` paths run binding validation by default — but if validation was set to `warn` mode or skipped (no `.SemanticModel/` sibling), re-check with `pbir_model_usage` after the fact.

5. **Run the validator suite.** Out-of-session: `npm run test:all` is the canonical full check (audit, wireframe, binding, title, layout, grid, slicer, schema-docs, surface, pagination, set-report). In-session, the LLM should at minimum re-run `pbir_list_pages({ includeVisuals: true })` + `pbir_list_filters` and reconcile against the planned state. If `pbir_add_visual` returned `layoutWarnings`, address them now — don't ship with overlaps or out-of-bounds visuals.

6. **Refresh Power BI Desktop.** PBI Desktop caches the report on open; programmatic file edits made after open are invisible until reload. Use `pbir_reload_report({ confirm: true })` after the user has saved any in-flight Desktop work (the tool will prompt for confirmation when called without `confirm`). For semantic-model-only changes, the `powerbi-modeling-mcp` server has its own refresh path — this server only owns the report side.

7. **Post-refresh verification.** After Desktop reopens the report, re-run the checks from steps 1-2-3 to confirm what's on disk is what Desktop is now rendering. If a visual or filter doesn't appear after reload, see `docs/pbir-gotchas.md` (auto-recovery masking, schema-version mismatches, etc.) before re-editing.

## If any check fails
Fix the underlying cause first — extra edits on top of a broken state compound the problem. Then re-run the full checklist. PBI Desktop will not surface partial-write damage; the only guarantee is "everything I planned to write is on disk AND visible after reload".

## Why this matters
Most PBIR silent-failure bugs are visibility bugs: the JSON wrote successfully but the agent never confirmed Desktop actually picked it up. The 7-step checklist closes that loop in a deterministic order so the agent doesn't drift into "looks done" without confirming "actually done".
