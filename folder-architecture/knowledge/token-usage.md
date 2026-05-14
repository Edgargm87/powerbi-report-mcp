<!-- mirrored from skills/token-usage.md at v0.9.6 (08eda17) -->

<!-- doc-version: 2.2 | Last updated: 2026-04-25 -->
<!-- summary: Cost-aware tool usage — slim modes, batch operations, auto-pageId, dedup cache, format-typo catcher, error-code legend pointer. Read when optimising context. -->
# Skill: Token Usage — Minimising LLM Cost & Context

Estimates based on Claude Sonnet. All figures are approximate.
Pricing reference: ~$3/M input tokens, ~$15/M output tokens.

## Highest-leverage patterns (do this / not that)

| Do | Not | Why |
|---|---|---|
| Omit `pageId` on single-page reports | Always pass `pageId` | Server auto-resolves. Saves ~25-50 tokens per call. |
| Batch `pbir_add_visual` with full inline `containerFormat` + `dataColors` | Call `pbir_format_visual` after | One call vs N+1 calls. ~2k saved on a 13-visual page. |
| Trust the format-typo catcher | Pre-call `pbir_lookup_theme_property` for every property | Catcher is always-on, returns one `didYouMean` per typo. Free when clean. |
| Read `skills/errors.md` once, learn the codes | Re-read prose after every validator hit | Codes are stable; the LLM only needs the legend once. |
| `pbir_get_visual` default (slim) | `verbose:true` reflexively | Default is id/type/pos/title/bindings (~50 tok). Verbose ships the full PBIR JSON (~500-700). |
| Trust the dedup cache (`_cache:"hit"`) | Re-call `pbir_list_visuals` mid-turn | Server returns `_cache:"hit"` — recognise it and stop re-asking. |
| `pbir_list_pages({includeVisuals:true})` once | `pbir_list_pages` then N×`pbir_list_visuals` | One call replaces N+1. |

> Pagination response includes both `truncated`/`nextOffset` (legacy) and `has_more`/`next_offset`/`total_count` (MCP-canonical). Prefer the canonical names in new agent prompts; legacy fields will be removed in a future major.

## Why this matters

Power BI report-building can be done in 5–6 well-chosen tool calls per page or in 30+ naive calls per page. The difference is roughly 5× on tokens and 3–4× on cost. This guide shows the low-cost path and what to avoid.

---

## Format-typo catcher (always-on, no opt-out)

`pbir_add_visual` and `pbir_format_visual` walk every category/property name in `containerFormat` / `visualFormat` against the bundled theme schema before the write. A misspelling returns:

```json
{ "success": false, "error": "format_typo",
  "issues": [{ "cat": "labls", "didYouMean": "labels" }] }
```

Free when clean (the schema index is built once at first call and memoised). No `strictFormat` flag — the catcher is on for everyone. Unknown `visualType` is a no-op (we don't gate writes on schema lag, so PBI can ship new visuals before we update the bundled schema).

Net effect: same "did you mean?" recovery the v0.6.1 schema validator gave you, without the 1.2MB schema walk on every call.

---

## Auto-resolved `pageId`

The 17 single-page tools (pbir_add_visual, pbir_format_visual, pbir_get_visual, pbir_list_visuals, pbir_layout_grid, bulk_*, etc.) treat `pageId` as optional. If the report has exactly one page, the server picks it. With multiple pages, you get a structured error listing `availableIds` so you can pick without an extra `pbir_list_pages`:

```json
{ "success": false, "error": "ambiguous_pageId",
  "availableIds": ["abc123", "def456"] }
```

`pbir_delete_page` and `pbir_duplicate_page` keep `pageId` required — auto-resolving a destructive page op is a foot-gun.

---

## Read-call dedup cache

A tiny LRU (16 entries / 30s TTL) sits in front of the read tools (`pbir_list_pages`, `pbir_list_visuals`, `pbir_get_visual`, `pbir_get_report`, `pbir_get_report_theme`, `pbir_list_filters`, `pbir_list_bookmarks`). Repeating the same call back-to-back returns the cached payload with `_cache:"hit"` injected:

```json
{ "pages": [...], "_cache": "hit" }
```

The marker is the LLM's signal: "I just asked this — stop re-asking next turn." The server side is a convenience, not a guarantee — the cache invalidates on any write to the same scope (page write → page-scoped reads dropped). Always *write* expecting fresh reads; don't structure logic around the cache.

---

## Error code legend → `pbir_guide("errors")`

Validators ship a stable `code` field plus structured payload (`actual`, `limits`, `suggestion`). The verbose `rule`/`pbir_guide`/`rawMessage` prose was dropped — the codes are documented in `skills/errors.md` (call `pbir_guide("errors")` once per session, not per error).

Examples: `out_of_bounds_right`, `wrong_horizontal_gap`, `binding_validation_failed`, `format_typo`, `ambiguous_pageId`. ~30-80 tokens saved per error-laden response.

---

## Fixed session overhead (paid once)

**The default is now to load all 55 tools at startup** (~11,000 tokens of schemas). This matches reality — most MCP clients (Claude Desktop especially) don't handle `tools/list_changed`, so lazy activation was broken there. Set `MCP_TOOLS=minimal` to opt into the tiered mode: 12 default tools + 42 on-demand via `pbir_load_tools` (saves ~7,500 tokens).

| Item | Tokens | Notes |
|---|---|---|
| 55 tool schemas (default mode) | ~11,000 | All tools ready to call |
| 12 tool schemas (minimal mode) | ~3,500 | Opt-in via `MCP_TOOLS=minimal` |
| `pbir_add_visual` schema alone | ~2,250 | Largest single schema |
| `pbir_set_report` | ~40 | Connect once per session |
| `pbir_list_pages` slim | ~40 | Orient on existing pages |
| Model read (tables + columns) | ~430 | Read once, reuse field names all session |
| **Default-mode session startup** | **~11,500** | All tools available immediately |
| **Minimal-mode session startup** | **~4,000** | Activate extras via `pbir_load_tools` |

> **`MCP_TOOLS=minimal`** opts into the tiered mode. Worth it only for long Claude Code sessions where the ~7,500 token savings compounds. Claude Desktop users: stick with the default.

> `pbir_list_pages({includeVisuals: true})` is the lowest-token recon call (~100 tokens replaces `pbir_list_pages` + N×`pbir_list_visuals`). `pbir_list_pages` is a default tool, so no `pbir_load_tools` dance required — just pass the flag.

---

## The 12 core tools (minimal mode starting set)

```
pbir_set_report           pbir_list_pages           pbir_list_visuals
pbir_create_page          pbir_add_visual           pbir_get_visual
pbir_format_visual        pbir_update_visual_bindings
pbir_set_report_theme     pbir_bulk_bind            pbir_model_usage
pbir_reload_report
```

These cover the entire happy-path: connect → orient → create page → add visuals → format → bind → theme → reload. Almost every report build can be done with this set alone. Single source of truth: `src/default-tools.ts`.

In the default mode, all 55 tools (including these 12) are loaded at startup. In `MCP_TOOLS=minimal` mode, only these 12 load at startup and the remaining 42 are activated via `pbir_load_tools`.

## On-demand tools (minimal mode only, via `pbir_load_tools`)

42 additional tools. Activate them when you need them:

```json
{ "tools": ["pbir_set_visual_sort", "pbir_set_conditional_format", "pbir_duplicate_page"] }
```

> **Harness caveat:** most LLM clients snapshot the tool catalog at session start. If your client behaves that way, `pbir_load_tools` activates server-side but the tools may not become invokable until the next session. This is why the default is now all-tools-loaded. Only switch to minimal mode if you're using a harness (like Claude Code) that re-reads the catalog.

---

## Binding validation cost (v0.6.1)

`pbir_add_visual`, `pbir_update_visual_bindings`, and `pbir_bulk_bind` now run every field reference through a model-backed validator **before any write**. The relevant question for this doc is: what does that cost in tokens?

**Clean bindings → zero extra cost.** The validator reads the already-cached `ModelFieldInventory` (same cache as `pbir_model_usage`) and returns an empty error list. The success response is byte-for-byte identical to the pre-v0.6.1 version.

**Broken bindings → tiny cost, massive saving.** When validation fires:

| Response field | Tokens | Notes |
|---|---|---|
| `error` (strict mode) | ~80–150 | Formatted human-readable header + per-error line |
| `bindingErrors[]` (structured) | ~40–80 per error | Each carries `reason`, `label`, `entity`, `property`, up to 3 suggestions |
| `bindingWarnings[]` (warn mode) | same as above | Attached to a `success: true` response instead of replacing it |
| `mode` | ~5 | One of `strict` / `warn` / `off` |

A typical typo response (2–3 errors) is ~200–400 tokens total. That sounds like a cost until you compare it to the pre-v0.6.1 failure loop:

```
WITHOUT validation:
  pbir_add_visual               → silent success (~200 tokens)
  pbir_reload_report            → success (~35)
  [user opens PBI Desktop, notices blank visual]
  pbir_get_visual slim=false    → ~600 tokens
  pbir_model_usage              → ~600–1,500 to find the real field name
  pbir_update_visual_bindings   → ~250
  pbir_reload_report            → ~35
  Total: ~1,700–2,600 tokens + human round-trip
```

```
WITH validation:
  pbir_add_visual               → validation error (~400)
  [agent reads "Did you mean Sales[Quantity]?", fixes spec]
  pbir_add_visual               → success (~200)
  Total: ~600 tokens, no human round-trip
```

**Net effect:** the validator is a token **saver** whenever it catches a real bug, and free when it doesn't. The only scenario where it adds cost without benefit is a deliberate bind against a field that isn't in the model yet (e.g. a sibling MCP is about to add it) — for that case, set `strictBindings: false` on the single call so the error downgrades to a warning and the write proceeds.

**Environment override:** `MCP_BINDING_VALIDATION=off` disables validation globally (skip the cached-inventory lookup entirely, zero overhead, zero safety). Don't flip this unless you have a specific reason — you're turning off a free brake.

---

## Bulk safety gate cost (v0.6.0)

`pbir_bulk_delete_visuals`, `pbir_bulk_update_format`, and `pbir_bulk_bind` all check a 5-visual threshold. When `confirmBulk: true` is needed but not set, the response is a ~80-token structured error:

```json
{ "success": false, "error": "Safety gate: ...", "count": 9, "threshold": 5, "confirmBulkRequired": true }
```

This looks like waste, but it's the gate for "accidentally pipe every id from `pbir_list_visuals` into `pbir_bulk_delete_visuals` and wipe the page" — the recovery cost for that mistake is a full page rebuild (~2,000 tokens in the best case). The gate costs ~80 tokens per miss; one prevented page-wipe pays for 25 gate errors.

**Rule:** never set `confirmBulk: true` reflexively. The gate is free when you stay under 5, and cheap insurance when you don't.

---

## Per-page variable cost (building one page)

| Operation | Input | Output | Total | Notes |
|---|---|---|---|---|
| `pbir_list_pages({includeVisuals: true})` | ~20 | ~80 | ~100 | Replaces `pbir_list_pages` + N×`pbir_list_visuals` |
| `pbir_list_pages` slim | ~10 | ~30 | ~40 | When you only need the page list |
| `pbir_create_page` | ~30 | ~25 | ~55 | |
| `pbir_add_visual` batch — shapes (~8) | ~450 | ~180 | ~630 | Wireframe layer |
| `pbir_add_visual` batch — 13 data visuals | ~1,200 | ~200 | ~1,400 | 4 KPIs + 5 slicers + 4 charts |
| Inline `title` per visual | ~20 | 0 | ~20 | No extra call |
| Inline `containerFormat` per visual | ~80 | 0 | ~80 | No extra call |
| `pbir_apply_theme` | ~20 | ~30 | ~50 | One call, whole page chrome — **on-demand**, costs one `pbir_load_tools` per session |
| `pbir_set_report_theme` | ~150 | ~50 | ~200 | One call, global brand |
| `pbir_bulk_update_format` (N visuals) | ~150 | ~50 | ~200 | One call, many visuals |
| `pbir_bulk_bind` (N visuals) | ~250 | ~80 | ~330 | One call, many rebinds |
| `pbir_format_visual` (per visual) | ~150 | ~50 | ~200 | If called individually ❌ |
| `pbir_set_visual_title` (per visual) | ~50 | ~30 | ~80 | If called individually ❌ |
| `pbir_model_usage` slim=true | ~20 | ~600–1,500 | ~620–1,520 | Depends on model size; cached |
| `pbir_reload_report` | ~10 | ~25 | ~35 | |

---

## Scenarios — building 1 page (4 KPIs + 5 slicers + 4 charts)

### Scenario A — Bare Minimum
> Shapes + data visuals only. No formatting. Auto-titles from field names.

| Step | Tokens |
|---|---|
| Session overhead | 4,000 |
| `pbir_list_pages` + `pbir_create_page` | 95 |
| `pbir_add_visual` shapes (8) | 630 |
| `pbir_add_visual` data visuals (13) | 1,400 |
| `pbir_reload_report` | 35 |
| **Total** | **~6,160** |
| **Approx cost** | **~$0.02** |

### Scenario B — Theme Only (recommended) ✅
> Inline **titles + bindings only** in `pbir_add_visual`. `pbir_set_report_theme` for chrome. No per-visual formatting — polish belongs to the developer. See `skills/formatting.md` "Three bands" for the decision rule.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| Inline titles (~20 × 13) | +260 |
| `pbir_set_report_theme` (1 call, first page only) | +200 |
| **Total** | **~6,620** |
| **vs Bare Minimum** | +460 (+7%) for titles + global brand |
| **Approx cost** | **~$0.03** |

The theme cascades to every visual automatically. No `containerFormat`, no `visualFormat`, no `pbir_apply_theme`, no per-visual override blocks to fight later theme changes. Cleanest handoff to the developer.

### Scenario C — Full Inline (when no developer polish is expected)
> Inline titles + inline `containerFormat` + `pbir_apply_theme` for page chrome. Use when you're producing a final report and no developer will touch it afterward.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| Inline titles (~20 × 13) | +260 |
| Inline `containerFormat` (~80 × 13) | +1,040 |
| `pbir_set_report_theme` (1 call, first page only) | +200 |
| `pbir_apply_theme` (on-demand, per page) | +50 |
| **Total** | **~7,710** |
| **vs Theme Only** | +1,090 (+16%) — only worth it when there's no developer handoff |
| **Approx cost** | **~$0.03** |

### Scenario D — Individual `pbir_format_visual` (the expensive way) ❌
> `pbir_format_visual` called separately for each of the 13 visuals after creation.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| 13 × `pbir_format_visual` calls | +2,600 |
| **Total** | **~8,760** |
| **vs Theme Only** | +2,140 (+32%) for the same result |

### Scenario E — Individual `pbir_set_visual_title` (avoidable) ❌
> Title set via separate `pbir_set_visual_title` call instead of inline.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| 13 × `pbir_set_visual_title` calls | +1,040 |
| **Total** | **~7,200** |
| **vs Theme Only** (inline titles) | +580 (+9%) for the same result |

---

## Multi-page session — cost comparison

Session overhead and model read paid **once**. Each additional page costs ~1,800 tokens (theme-only approach) or ~2,200 tokens (full-inline).

> ⚠️ Context accumulates — every prior tool result stays in context for subsequent calls.
> Each page adds ~500 tokens of accumulated context carry-forward.

| Pages | Theme Only (B) | Full Inline (C) | Individual Format (D) |
|---|---|---|---|
| 1 | ~6,600 | ~7,700 | ~8,800 |
| 2 | ~8,400 | ~9,900 | ~13,200 |
| 3 | ~10,200 | ~12,100 | ~17,500 |
| 4 | ~12,000 | ~14,300 | ~22,000 |
| 5 | ~13,800 | ~16,500 | ~26,500 |
| 6 | ~15,600 | ~18,700 | ~31,000 |
| 7 | ~17,400 | ~20,900 | ~35,500 |
| 8 | ~19,200 | ~23,100 | ~40,000 |
| 9 | ~21,000 | ~25,300 | ~45,000 |
| 10 | ~22,800 | ~27,500 | ~50,000 |

---

## Context accumulation — when to `/compact`

After each page, accumulated tool results grow the context window:

| Pages built | Approx accumulated context | Action |
|---|---|---|
| 1–2 | ~3,000 extra | Fine |
| 3–4 | ~6,000 extra | Consider `/compact` |
| 5+ | ~10,000+ extra | `/compact` recommended |

`/compact` collapses prior history into a summary, resetting accumulated context while preserving session knowledge (page IDs, field names, design decisions).

---

## Token cost by operation type

| Operation | Cost tier | Reason |
|---|---|---|
| `pbir_set_report_theme` | 🟢 Cheap | 1 call, global effect |
| `pbir_apply_theme` | 🟢 Cheap | 1 call, whole page |
| `pbir_add_visual` batch | 🟢 Cheap | N visuals, 1 call |
| Inline `containerFormat` | 🟢 Free | No extra call |
| Inline `visualFormat` / `dataColors` | 🟢 Free | No extra call |
| Inline `title` | 🟢 Free | No extra call |
| `pbir_list_pages({includeVisuals: true})` | 🟢 Cheap | ~100 tokens, replaces N+1 calls |
| `pbir_list_pages` slim | 🟢 Cheap | ~40 tokens |
| `pbir_list_visuals` slim | 🟢 Cheap | ~30 tokens per visual |
| `pbir_get_visual` slim | 🟢 Cheap | ~50 tokens — bindings summary |
| `pbir_list_filters` slim | 🟢 Cheap | `Table[Column]` strings only |
| `pbir_bulk_update_format` | 🟢 Cheap | 1 call, many visuals |
| `pbir_bulk_bind` | 🟢 Cheap | 1 call, many rebinds |
| `pbir_bulk_delete_visuals` | 🟢 Cheap | 1 call, many deletes |
| `pbir_format_visual` ×N | 🟡 Medium | 1 call per visual |
| `pbir_set_visual_title` ×N | 🟡 Medium | 1 call per visual |
| `pbir_get_visual` slim=false | 🟡 Medium | Full PBIR JSON ~500–700 tokens |
| `pbir_list_visuals` slim=false | 🟡 Medium | Full position objects |
| `pbir_model_usage` slim=true | 🟡 Medium | ~600–1,500 tokens, but cached & invaluable |
| `pbir_model_usage` slim=false | 🔴 Expensive | Full DAX expressions, dependency graphs — only when needed |
| Binding validation (clean) | 🟢 Free | No extra tokens, no extra round-trip |
| Binding validation (error) | 🟢 Cheap | ~40–80 tokens per error, prevents multi-call rebuild cycle |
| `confirmBulk` gate (passing) | 🟢 Free | Parameter check, no cost |
| `confirmBulk` gate (blocked) | 🟢 Cheap | ~80 tokens, prevents ~2,000-token page-rebuild recovery |
| Default tool schemas | 🔴 Fixed | ~3,500, unavoidable |
| `MCP_TOOLS=all` schemas | 🔴 Fixed | ~11,000 — only worth it for tool-heavy sessions |

---

## Rules of thumb

1. **Don't format visuals unless asked** — `pbir_set_report_theme` for chrome, developer does polish in PBI Desktop. See `skills/formatting.md` "Three bands"
2. **Set titles inline** in `pbir_add_visual`, never via `pbir_set_visual_title` after
3. **Don't customise fonts/axes** unless explicitly asked — defaults are fine
4. **Read the model once** — store field names mentally, don't re-read
5. **`/compact` every 3–4 pages** — biggest single lever for long sessions
6. **`pbir_set_report_theme` once per report** — not once per page
7. **Batch everything** — 1 `pbir_add_visual` with 13 visuals beats 13 `pbir_add_visual` calls
8. **Use `pbir_list_pages({includeVisuals: true})` for recon** — not `pbir_list_pages` + N×`pbir_list_visuals`
9. **Use `bulk_*` tools** when the same change applies to many visuals (respects `confirmBulk` gate at >5 items)
10. **Activate non-default tools sparingly** — each `pbir_load_tools` call adds schemas to context
11. **Cache `pbir_model_usage`** — it auto-invalidates on file changes; don't re-call needlessly
12. **Trust binding validation** (v0.6.1) — if a field ref is wrong, the validator will say so with a "did you mean" suggestion. Don't pre-read `pbir_model_usage` just to spell-check; let the validator do it.
13. **Never set `strictBindings: false` reflexively** — only when you know the field will exist after a sibling write. The safety net is free.
14. **Never set `confirmBulk: true` reflexively** — the gate is free when you stay under 5 visuals, and one prevented page-wipe pays for dozens of gate errors.
15. **Omit `pageId` when there's only one page** — server auto-resolves. With multiple pages the error response lists `availableIds` so you can pick without an extra `pbir_list_pages`.
16. **Trust the format-typo catcher** — `pbir_add_visual` / `pbir_format_visual` flag misspelled category/property names with a `didYouMean` suggestion. Don't pre-call `pbir_lookup_theme_property` to spell-check.
17. **Watch for `_cache:"hit"`** — the server deduped your read. Recognise the marker and stop re-asking the same thing next turn.
18. **Read `pbir_guide("errors")` once per session** — codes are stable; you don't need to re-derive them from the prose every time a validator fires.

---

## Optimal page build — call sequence

```
Session start (once):
  pbir_set_report
  pbir_model_usage             ← read model fields once (cached)
  pbir_set_report_theme        ← global brand, skip if already set

Per page:
  pbir_create_page
  pbir_add_visual (batch)      ← shapes first (wireframe layer)
  pbir_add_visual (batch)      ← all data visuals with inline title + bindings
                          ← bindings auto-validated (v0.6.1); typos fail upfront with suggestions
                          ← NO containerFormat/visualFormat — theme handles chrome, developer handles polish
  /compact every 3–4 pages

Session end:
  pbir_reload_report
```

**Total calls for a 13-visual page: 4–5** (theme-only)
**Total calls naive approach: 30+**

> **When to go beyond theme-only:** If the user explicitly requests per-visual formatting (e.g. "make the revenue card have a blue background"), use `containerFormat` inline or `pbir_format_visual` for that specific visual. The rule is: theme by default, format by request.

---

## When to load on-demand tools

| Need | Tool to load |
|---|---|
| Conditional formatting (rules / gradient) | `pbir_set_conditional_format` |
| Override the auto-sort | `pbir_set_visual_sort` |
| Find unused fields | `pbir_model_usage` (already default) |
| Audit theme overrides | `pbir_audit_theme_compliance` |
| Diff a theme before applying | `pbir_diff_report_theme` |
| Bulk delete a column of slicers | `pbir_bulk_delete_visuals` |
| Bulk reformat 30 cards at once | `pbir_bulk_update_format` |
| Add a TopN filter to one chart | `pbir_add_page_filter` (also `pbir_list_filters`) |
| Cross-filter rules between visuals | `pbir_set_visual_interaction` |
| Drillthrough page setup | already covered by default `pbir_create_page` |
| Image / actionButton / pageNavigator | already covered by default `pbir_add_visual` |

Group the activations into one `pbir_load_tools` call when you can:
```json
{ "tools": ["pbir_set_conditional_format", "pbir_set_visual_sort", "pbir_audit_theme_compliance"] }
```
