<!-- doc-version: 1.3 | Last updated: 2026-05-02 -->
# Backlog — powerbi-report-mcp

Forward-looking work, organised by likely version. Each item lists evidence
(where the idea came from) so future-you can re-evaluate priority.

---

## v0.9.2 — open

Items 1–5, 7–9 from the original v0.9.2 list shipped on 2026-05-02 (see
`changelog/v0.9.2.md`). Item 6 is the only remaining work — kept here
because it requires a human at the keyboard to capture screenshots.

| # | Item | Evidence | Effort |
|---|------|----------|-------:|
| 6 | Add the 3 `<!-- TODO: add screenshot -->` markers (hero, batch, plugin install) to actual screenshots in README.md | Tracked since v0.8.2 | S (manual) |

---

## Investigation needed — slicer defaults not always applying

Reported by user during real Cowork session: slicers are still not landing on
the documented house defaults (184×60, `title.show: false`, `header.show: true`,
8pt text, etc.) every time, despite `scripts/test-slicer-defaults.js` passing
all assertions at the unit level.

**Status:** Needs more testing to characterise. The unit tests cover
`createAndSaveVisual` directly; the symptom may be in the call-path between
the MCP tool entry and the helper, or in caller behaviour (LLM passing
`title` or explicit dimensions which intentionally override defaults).

**Next step:** capture a `pbir_get_visual({verbose:true})` payload of a
broken slicer + the originating `pbir_add_visual` call, then diff against
the expected shape from `test-slicer-defaults.js`. From there decide if
it's a code fix, a skill rewording (so the LLM stops over-specifying), or
a doc fix to the defaults table.

Likely culprits to rule out first:
- LLM passing `title`, `width`, or `height` explicitly → defaults only fire when omitted (intentional)
- LLM passing `containerFormat` / `visualFormat` → overrides chrome defaults
- `height < 44` auto-bump not firing in some path
- `queryState` bucket coercion (fixed in `c977f46` for new writes — verify no regression)

Once characterised, slot into the appropriate version (likely v0.9.x patch
or v0.10.0 if it touches the binding/format layer).

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
