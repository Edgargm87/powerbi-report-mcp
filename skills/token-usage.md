<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
# Skill: Token Usage — Minimising LLM Cost & Context

Estimates based on Claude Sonnet. All figures are approximate.
Pricing reference: ~$3/M input tokens, ~$15/M output tokens.

## Why this matters

Power BI report-building can be done in 5–6 well-chosen tool calls per page or in 30+ naive calls per page. The difference is roughly 5× on tokens and 3–4× on cost. This guide shows the low-cost path and what to avoid.

---

## Fixed session overhead (paid once)

The MCP server ships with **12 default tools** loaded at startup (~3,500 tokens of schemas) and **42 on-demand tools** that aren't paid for unless you activate them via `load_tools`.

| Item | Tokens | Notes |
|---|---|---|
| 12 default tool schemas | ~3,500 | The starting catalog |
| `add_visual` schema alone | ~2,250 | Largest single schema |
| `set_report` | ~40 | Connect once per session |
| `get_page_summary` | ~60 | Orient on existing pages + visuals — replaces `list_pages` + N×`list_visuals` |
| Model read (tables + columns) | ~430 | Read once, reuse field names all session |
| **Session startup total** | **~4,000** | Amortised across all pages built |

> **`MCP_TOOLS=all`** loads every tool at startup — adds ~7,500 tokens of schemas. Worth it only if you genuinely need to call non-default tools more than 2–3 times per session.

---

## The 12 default tools (loaded at startup)

```
set_report           list_pages           list_visuals
create_page          add_visual           get_visual
format_visual        update_visual_bindings
set_report_theme     bulk_bind            model_usage
reload_report
```

These cover the entire happy-path: connect → orient → create page → add visuals → format → bind → theme → reload. Almost every report build can be done with this set alone.

## On-demand tools (load via `load_tools`)

42 additional tools — none load by default. Activate them when you need them:

```json
{ "tools": ["set_visual_sort", "set_conditional_format", "duplicate_page"] }
```

> **Harness caveat:** most LLM clients snapshot the tool catalog at session start. If your client behaves that way, `load_tools` activates server-side but the tools may not become invokable until the next session. Either start with `MCP_TOOLS=all` or use a harness that re-reads the catalog.

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
| `apply_theme` | ~20 | ~30 | ~50 | One call, whole page chrome |
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
| `get_page_summary` + `create_page` | 155 |
| `add_visual` shapes (8) | 630 |
| `add_visual` data visuals (13) | 1,400 |
| `reload_report` | 35 |
| **Total** | **~6,220** |
| **Approx cost** | **~$0.02** |

### Scenario B — Recommended ✅
> Inline titles + inline containerFormat in `add_visual`. `apply_theme` for chrome. No extra calls.

| Step | Tokens |
|---|---|
| Scenario A | 6,220 |
| Inline titles (~20 × 13) | +260 |
| Inline `containerFormat` (~80 × 13) | +1,040 |
| `apply_theme` | +50 |
| **Total** | **~7,570** |
| **vs Bare Minimum** | +1,350 (+22%) for full styling |
| **Approx cost** | **~$0.03** |

### Scenario C — Full Brand Setup
> `set_report_theme` (global) + `apply_theme` (page) + inline titles. Still minimal calls.

| Step | Tokens |
|---|---|
| Scenario B | 7,570 |
| `set_report_theme` (1 call, first page only) | +200 |
| **Total** | **~7,770** |
| **Approx cost** | **~$0.03** |

### Scenario D — Individual `format_visual` (the expensive way) ❌
> `format_visual` called separately for each of the 13 visuals after creation.

| Step | Tokens |
|---|---|
| Scenario A | 6,220 |
| 13 × `format_visual` calls | +2,600 |
| **Total** | **~8,820** |
| **vs Recommended** | +1,250 (+17%) for the same result |

### Scenario E — Individual `set_visual_title` (avoidable) ❌
> Title set via separate `set_visual_title` call instead of inline.

| Step | Tokens |
|---|---|
| Scenario A | 6,220 |
| 13 × `set_visual_title` calls | +1,040 |
| **Total** | **~7,260** |
| **vs Recommended** (inline titles) | +700 (+10%) for the same result |

---

## Multi-page session — cost comparison

Session overhead and model read paid **once**. Each additional page costs ~2,000 tokens (recommended approach).

> ⚠️ Context accumulates — every prior tool result stays in context for subsequent calls.
> Each page adds ~500 tokens of accumulated context carry-forward.

| Pages | Recommended (B) | Individual Format (D) | Savings |
|---|---|---|---|
| 1 | ~7,500 | ~8,800 | ~1,300 |
| 3 | ~12,000 | ~17,500 | ~5,500 |
| 5 | ~16,500 | ~26,500 | ~10,000 |
| 10 | ~28,000 | ~50,000 | ~22,000 |

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
| Default tool schemas | 🔴 Fixed | ~3,500, unavoidable |
| `MCP_TOOLS=all` schemas | 🔴 Fixed | ~11,000 — only worth it for tool-heavy sessions |

---

## Rules of thumb

1. **Never format visuals individually** — use `apply_theme` + inline `containerFormat`/`visualFormat`
2. **Set titles inline** in `add_visual`, never via `set_visual_title` after
3. **Don't customise fonts/axes** unless explicitly asked — defaults are fine
4. **Read the model once** — store field names mentally, don't re-read
5. **`/compact` every 3–4 pages** — biggest single lever for long sessions
6. **`set_report_theme` once per report** — not once per page
7. **Batch everything** — 1 `add_visual` with 13 visuals beats 13 `add_visual` calls
8. **Use `get_page_summary` for recon** — not `list_pages` + N×`list_visuals`
9. **Use `bulk_*` tools** when the same change applies to many visuals
10. **Activate non-default tools sparingly** — each `load_tools` call adds schemas to context
11. **Cache `model_usage`** — it auto-invalidates on file changes; don't re-call needlessly

---

## Optimal page build — call sequence

```
Session start (once):
  set_report
  get_page_summary        ← all pages + visuals in 1 call
  (read model fields once)
  set_report_theme        ← global brand, skip if already set

Per page:
  create_page
  add_visual (batch)      ← shapes first (wireframe layer)
  add_visual (batch)      ← all data visuals with inline title + containerFormat
  apply_theme             ← container chrome polish, 1 call
  /compact every 3–4 pages

Session end:
  reload_report
```

**Total calls for a 13-visual page: 5–6**
**Total calls naive approach: 30+**

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
