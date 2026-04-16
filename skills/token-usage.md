<!-- doc-version: 2.1 | Last updated: 2026-04-15 -->
# Skill: Token Usage — Minimising LLM Cost & Context

Estimates based on Claude Sonnet. All figures are approximate.
Pricing reference: ~$3/M input tokens, ~$15/M output tokens.

## Why this matters

Power BI report-building can be done in 5–6 well-chosen tool calls per page or in 30+ naive calls per page. The difference is roughly 5× on tokens and 3–4× on cost. This guide shows the low-cost path and what to avoid.

---

## Fixed session overhead (paid once)

**The default is now to load all 55 tools at startup** (~11,000 tokens of schemas). This matches reality — most MCP clients (Claude Desktop especially) don't handle `tools/list_changed`, so lazy activation was broken there. Set `MCP_TOOLS=minimal` to opt into the tiered mode: 12 default tools + 42 on-demand via `load_tools` (saves ~7,500 tokens).

| Item | Tokens | Notes |
|---|---|---|
| 55 tool schemas (default mode) | ~11,000 | All tools ready to call |
| 12 tool schemas (minimal mode) | ~3,500 | Opt-in via `MCP_TOOLS=minimal` |
| `add_visual` schema alone | ~2,250 | Largest single schema |
| `set_report` | ~40 | Connect once per session |
| `list_pages` slim | ~40 | Orient on existing pages |
| Model read (tables + columns) | ~430 | Read once, reuse field names all session |
| **Default-mode session startup** | **~11,500** | All tools available immediately |
| **Minimal-mode session startup** | **~4,000** | Activate extras via `load_tools` |

> **`MCP_TOOLS=minimal`** opts into the tiered mode. Worth it only for long Claude Code sessions where the ~7,500 token savings compounds. Claude Desktop users: stick with the default.

> In minimal mode, `get_page_summary` is on-demand. It's the lowest-token recon call (~100 tokens replaces `list_pages` + N×`list_visuals`), but you have to activate it first with `load_tools(["get_page_summary"])`. The trade-off: 1 `load_tools` call + the schema cost (~80 tokens) vs. saving 2–3 extra recon calls per session. Worth it on sessions that touch more than one page.

---

## The 12 core tools (minimal mode starting set)

```
set_report           list_pages           list_visuals
create_page          add_visual           get_visual
format_visual        update_visual_bindings
set_report_theme     bulk_bind            model_usage
reload_report
```

These cover the entire happy-path: connect → orient → create page → add visuals → format → bind → theme → reload. Almost every report build can be done with this set alone. Single source of truth: `src/default-tools.ts`.

In the default mode, all 55 tools (including these 12) are loaded at startup. In `MCP_TOOLS=minimal` mode, only these 12 load at startup and the remaining 42 are activated via `load_tools`.

## On-demand tools (minimal mode only, via `load_tools`)

42 additional tools. Activate them when you need them:

```json
{ "tools": ["set_visual_sort", "set_conditional_format", "duplicate_page"] }
```

> **Harness caveat:** most LLM clients snapshot the tool catalog at session start. If your client behaves that way, `load_tools` activates server-side but the tools may not become invokable until the next session. This is why the default is now all-tools-loaded. Only switch to minimal mode if you're using a harness (like Claude Code) that re-reads the catalog.

---

## Binding validation cost (v0.6.1)

`add_visual`, `update_visual_bindings`, and `bulk_bind` now run every field reference through a model-backed validator **before any write**. The relevant question for this doc is: what does that cost in tokens?

**Clean bindings → zero extra cost.** The validator reads the already-cached `ModelFieldInventory` (same cache as `model_usage`) and returns an empty error list. The success response is byte-for-byte identical to the pre-v0.6.1 version.

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
  add_visual               → silent success (~200 tokens)
  reload_report            → success (~35)
  [user opens PBI Desktop, notices blank visual]
  get_visual slim=false    → ~600 tokens
  model_usage              → ~600–1,500 to find the real field name
  update_visual_bindings   → ~250
  reload_report            → ~35
  Total: ~1,700–2,600 tokens + human round-trip
```

```
WITH validation:
  add_visual               → validation error (~400)
  [agent reads "Did you mean Sales[Quantity]?", fixes spec]
  add_visual               → success (~200)
  Total: ~600 tokens, no human round-trip
```

**Net effect:** the validator is a token **saver** whenever it catches a real bug, and free when it doesn't. The only scenario where it adds cost without benefit is a deliberate bind against a field that isn't in the model yet (e.g. a sibling MCP is about to add it) — for that case, set `strictBindings: false` on the single call so the error downgrades to a warning and the write proceeds.

**Environment override:** `MCP_BINDING_VALIDATION=off` disables validation globally (skip the cached-inventory lookup entirely, zero overhead, zero safety). Don't flip this unless you have a specific reason — you're turning off a free brake.

---

## Bulk safety gate cost (v0.6.0)

`bulk_delete_visuals`, `bulk_update_format`, and `bulk_bind` all check a 5-visual threshold. When `confirmBulk: true` is needed but not set, the response is a ~80-token structured error:

```json
{ "success": false, "error": "Safety gate: ...", "count": 9, "threshold": 5, "confirmBulkRequired": true }
```

This looks like waste, but it's the gate for "accidentally pipe every id from `list_visuals` into `bulk_delete_visuals` and wipe the page" — the recovery cost for that mistake is a full page rebuild (~2,000 tokens in the best case). The gate costs ~80 tokens per miss; one prevented page-wipe pays for 25 gate errors.

**Rule:** never set `confirmBulk: true` reflexively. The gate is free when you stay under 5, and cheap insurance when you don't.

---

## Per-page variable cost (building one page)

| Operation | Input | Output | Total | Notes |
|---|---|---|---|---|
| `get_page_summary` (all pages) | ~20 | ~80 | ~100 | Replaces `list_pages` + N×`list_visuals` |
| `list_pages` slim | ~10 | ~30 | ~40 | When you only need the page list |
| `create_page` | ~30 | ~25 | ~55 | |
| `add_visual` batch — shapes (~8) | ~450 | ~180 | ~630 | Wireframe layer |
| `add_visual` batch — 13 data visuals | ~1,200 | ~200 | ~1,400 | 4 KPIs + 5 slicers + 4 charts |
| Inline `title` per visual | ~20 | 0 | ~20 | No extra call |
| Inline `containerFormat` per visual | ~80 | 0 | ~80 | No extra call |
| `apply_theme` | ~20 | ~30 | ~50 | One call, whole page chrome — **on-demand**, costs one `load_tools` per session |
| `set_report_theme` | ~150 | ~50 | ~200 | One call, global brand |
| `bulk_update_format` (N visuals) | ~150 | ~50 | ~200 | One call, many visuals |
| `bulk_bind` (N visuals) | ~250 | ~80 | ~330 | One call, many rebinds |
| `format_visual` (per visual) | ~150 | ~50 | ~200 | If called individually ❌ |
| `set_visual_title` (per visual) | ~50 | ~30 | ~80 | If called individually ❌ |
| `model_usage` slim=true | ~20 | ~600–1,500 | ~620–1,520 | Depends on model size; cached |
| `reload_report` | ~10 | ~25 | ~35 | |

---

## Scenarios — building 1 page (4 KPIs + 5 slicers + 4 charts)

### Scenario A — Bare Minimum
> Shapes + data visuals only. No formatting. Auto-titles from field names.

| Step | Tokens |
|---|---|
| Session overhead | 4,000 |
| `list_pages` + `create_page` | 95 |
| `add_visual` shapes (8) | 630 |
| `add_visual` data visuals (13) | 1,400 |
| `reload_report` | 35 |
| **Total** | **~6,160** |
| **Approx cost** | **~$0.02** |

### Scenario B — Theme Only (recommended) ✅
> Inline **titles + bindings only** in `add_visual`. `set_report_theme` for chrome. No per-visual formatting — polish belongs to the developer. See `skills/formatting.md` "Three bands" for the decision rule.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| Inline titles (~20 × 13) | +260 |
| `set_report_theme` (1 call, first page only) | +200 |
| **Total** | **~6,620** |
| **vs Bare Minimum** | +460 (+7%) for titles + global brand |
| **Approx cost** | **~$0.03** |

The theme cascades to every visual automatically. No `containerFormat`, no `visualFormat`, no `apply_theme`, no per-visual override blocks to fight later theme changes. Cleanest handoff to the developer.

### Scenario C — Full Inline (when no developer polish is expected)
> Inline titles + inline `containerFormat` + `apply_theme` for page chrome. Use when you're producing a final report and no developer will touch it afterward.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| Inline titles (~20 × 13) | +260 |
| Inline `containerFormat` (~80 × 13) | +1,040 |
| `set_report_theme` (1 call, first page only) | +200 |
| `apply_theme` (on-demand, per page) | +50 |
| **Total** | **~7,710** |
| **vs Theme Only** | +1,090 (+16%) — only worth it when there's no developer handoff |
| **Approx cost** | **~$0.03** |

### Scenario D — Individual `format_visual` (the expensive way) ❌
> `format_visual` called separately for each of the 13 visuals after creation.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| 13 × `format_visual` calls | +2,600 |
| **Total** | **~8,760** |
| **vs Theme Only** | +2,140 (+32%) for the same result |

### Scenario E — Individual `set_visual_title` (avoidable) ❌
> Title set via separate `set_visual_title` call instead of inline.

| Step | Tokens |
|---|---|
| Scenario A | 6,160 |
| 13 × `set_visual_title` calls | +1,040 |
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
| `set_report_theme` | 🟢 Cheap | 1 call, global effect |
| `apply_theme` | 🟢 Cheap | 1 call, whole page |
| `add_visual` batch | 🟢 Cheap | N visuals, 1 call |
| Inline `containerFormat` | 🟢 Free | No extra call |
| Inline `visualFormat` / `dataColors` | 🟢 Free | No extra call |
| Inline `title` | 🟢 Free | No extra call |
| `get_page_summary` | 🟢 Cheap | ~100 tokens, replaces N+1 calls |
| `list_pages` slim | 🟢 Cheap | ~40 tokens |
| `list_visuals` slim | 🟢 Cheap | ~30 tokens per visual |
| `get_visual` slim | 🟢 Cheap | ~50 tokens — bindings summary |
| `list_filters` slim | 🟢 Cheap | `Table[Column]` strings only |
| `bulk_update_format` | 🟢 Cheap | 1 call, many visuals |
| `bulk_bind` | 🟢 Cheap | 1 call, many rebinds |
| `bulk_delete_visuals` | 🟢 Cheap | 1 call, many deletes |
| `format_visual` ×N | 🟡 Medium | 1 call per visual |
| `set_visual_title` ×N | 🟡 Medium | 1 call per visual |
| `get_visual` slim=false | 🟡 Medium | Full PBIR JSON ~500–700 tokens |
| `list_visuals` slim=false | 🟡 Medium | Full position objects |
| `model_usage` slim=true | 🟡 Medium | ~600–1,500 tokens, but cached & invaluable |
| `model_usage` slim=false | 🔴 Expensive | Full DAX expressions, dependency graphs — only when needed |
| Binding validation (clean) | 🟢 Free | No extra tokens, no extra round-trip |
| Binding validation (error) | 🟢 Cheap | ~40–80 tokens per error, prevents multi-call rebuild cycle |
| `confirmBulk` gate (passing) | 🟢 Free | Parameter check, no cost |
| `confirmBulk` gate (blocked) | 🟢 Cheap | ~80 tokens, prevents ~2,000-token page-rebuild recovery |
| Default tool schemas | 🔴 Fixed | ~3,500, unavoidable |
| `MCP_TOOLS=all` schemas | 🔴 Fixed | ~11,000 — only worth it for tool-heavy sessions |

---

## Rules of thumb

1. **Don't format visuals unless asked** — `set_report_theme` for chrome, developer does polish in PBI Desktop. See `skills/formatting.md` "Three bands"
2. **Set titles inline** in `add_visual`, never via `set_visual_title` after
3. **Don't customise fonts/axes** unless explicitly asked — defaults are fine
4. **Read the model once** — store field names mentally, don't re-read
5. **`/compact` every 3–4 pages** — biggest single lever for long sessions
6. **`set_report_theme` once per report** — not once per page
7. **Batch everything** — 1 `add_visual` with 13 visuals beats 13 `add_visual` calls
8. **Use `get_page_summary` for recon** — not `list_pages` + N×`list_visuals` (activate via `load_tools` once)
9. **Use `bulk_*` tools** when the same change applies to many visuals (respects `confirmBulk` gate at >5 items)
10. **Activate non-default tools sparingly** — each `load_tools` call adds schemas to context
11. **Cache `model_usage`** — it auto-invalidates on file changes; don't re-call needlessly
12. **Trust binding validation** (v0.6.1) — if a field ref is wrong, the validator will say so with a "did you mean" suggestion. Don't pre-read `model_usage` just to spell-check; let the validator do it.
13. **Never set `strictBindings: false` reflexively** — only when you know the field will exist after a sibling write. The safety net is free.
14. **Never set `confirmBulk: true` reflexively** — the gate is free when you stay under 5 visuals, and one prevented page-wipe pays for dozens of gate errors.

---

## Optimal page build — call sequence

```
Session start (once):
  set_report
  model_usage             ← read model fields once (cached)
  set_report_theme        ← global brand, skip if already set

Per page:
  create_page
  add_visual (batch)      ← shapes first (wireframe layer)
  add_visual (batch)      ← all data visuals with inline title + bindings
                          ← bindings auto-validated (v0.6.1); typos fail upfront with suggestions
                          ← NO containerFormat/visualFormat — theme handles chrome, developer handles polish
  /compact every 3–4 pages

Session end:
  reload_report
```

**Total calls for a 13-visual page: 4–5** (theme-only)
**Total calls naive approach: 30+**

> **When to go beyond theme-only:** If the user explicitly requests per-visual formatting (e.g. "make the revenue card have a blue background"), use `containerFormat` inline or `format_visual` for that specific visual. The rule is: theme by default, format by request.

---

## When to load on-demand tools

| Need | Tool to load |
|---|---|
| Conditional formatting (rules / gradient) | `set_conditional_format` |
| Override the auto-sort | `set_visual_sort` |
| Find unused fields | `model_usage` (already default) |
| Audit theme overrides | `audit_theme_compliance` |
| Diff a theme before applying | `diff_report_theme` |
| Bulk delete a column of slicers | `bulk_delete_visuals` |
| Bulk reformat 30 cards at once | `bulk_update_format` |
| Add a TopN filter to one chart | `add_page_filter` (also `list_filters`) |
| Cross-filter rules between visuals | `set_visual_interaction` |
| Drillthrough page setup | already covered by default `create_page` |
| Image / actionButton / pageNavigator | already covered by default `add_visual` |

Group the activations into one `load_tools` call when you can:
```json
{ "tools": ["set_conditional_format", "set_visual_sort", "audit_theme_compliance"] }
```
