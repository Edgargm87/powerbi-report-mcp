# Token Usage Guide — powerbi-report-mcp

Estimates based on Claude Sonnet. All figures are approximate.
Pricing reference: ~$3/M input tokens, ~$15/M output tokens.

---

## Fixed Session Overhead (paid once, every session)

| Item | Tokens | Notes |
|---|---|---|
| All tool schemas loaded into context | ~12,000 | Unavoidable — MCP loads all 50+ tool definitions |
| `add_visual` schema alone | ~2,500 | Largest single schema — all visual types + params |
| `set_report` | ~40 | Connect once per session |
| Model read (tables + columns) | ~430 | Read once, reuse field names all session |
| **Session startup total** | **~12,500** | Amortised across all pages built |

---

## Per-Page Variable Cost (building one page)

### Building blocks

| Operation | Input | Output | Total | Notes |
|---|---|---|---|---|
| `list_pages` (slim) | ~10 | ~30 | ~40 | Default slim mode |
| `create_page` | ~30 | ~25 | ~55 | |
| `add_visual` batch — shapes (~8) | ~450 | ~180 | ~630 | Wireframe layer |
| `add_visual` batch — 13 data visuals | ~1,200 | ~200 | ~1,400 | 4 KPIs + 5 slicers + 4 charts |
| `apply_theme` | ~20 | ~30 | ~50 | 1 call = all container chrome |
| `set_report_theme` | ~150 | ~50 | ~200 | 1 call = global brand colors |
| `reload_report` | ~10 | ~25 | ~35 | |
| `format_visual` (per visual) | ~150 | ~50 | ~200 | If called individually |
| `set_visual_title` (per visual) | ~50 | ~30 | ~80 | If called individually |

---

## Scenarios — 1 Page (4 KPIs + 5 Slicers + 4 Charts)

### Scenario A — Bare Minimum
> Shapes + data visuals only. No formatting. Auto-titles from field names.

| Step | Tokens |
|---|---|
| Session overhead | 12,500 |
| list_pages + create_page | 95 |
| add_visual shapes (8) | 630 |
| add_visual data visuals (13) | 1,400 |
| reload_report | 35 |
| **Total** | **~14,660** |
| **Approx cost** | **~$0.05** |

---

### Scenario B — Recommended ✅
> Titles inline during add_visual. apply_theme for chrome. No extra calls.

| Step | Tokens |
|---|---|
| Scenario A | 14,660 |
| Inline titles in add_visual (+~20 tokens/visual × 13) | +260 |
| apply_theme (1 call) | +50 |
| **Total** | **~14,970** |
| **vs Bare Minimum** | **+310 tokens (~2% more)** |
| **Approx cost** | **~$0.05** |

---

### Scenario C — Full Brand Setup
> set_report_theme (global) + apply_theme (page) + inline titles. Still minimal calls.

| Step | Tokens |
|---|---|
| Scenario B | 14,970 |
| set_report_theme (1 call, first page only) | +200 |
| **Total** | **~15,170** |
| **vs Bare Minimum** | **+510 tokens (~3% more)** |
| **Approx cost** | **~$0.05** |

---

### Scenario D — Individual format_visual (the expensive way) ❌
> format_visual called separately for each of the 13 visuals after creation.

| Step | Tokens |
|---|---|
| Scenario A | 14,660 |
| 13 × format_visual calls | +2,600 |
| **Total** | **~17,260** |
| **vs Recommended** | **+2,290 tokens (+15%)** |
| **Approx cost** | **~$0.06** |

---

### Scenario E — Individual set_visual_title (avoidable) ❌
> Title set via separate set_visual_title call for each visual instead of inline.

| Step | Tokens |
|---|---|
| Scenario A | 14,660 |
| 13 × set_visual_title calls | +1,040 |
| **Total** | **~15,700** |
| **vs Recommended (inline titles)** | **+730 tokens (+5%)** |

---

## Multi-Page Session — Cost Comparison

Session overhead and model read paid **once**. Each additional page costs ~2,000 tokens (recommended approach).

> ⚠️ Context accumulates — every prior tool result stays in context for subsequent calls.
> Each page adds ~500 tokens of accumulated context carry-forward.

| Pages | Recommended (B) | Individual Format (D) | Savings |
|---|---|---|---|
| 1 | ~15,000 | ~17,300 | ~2,300 |
| 3 | ~19,000 | ~26,200 | ~7,200 |
| 5 | ~23,000 | ~35,000 | ~12,000 |
| 10 | ~35,500 | ~57,500 | ~22,000 |

---

## Context Accumulation — When to `/compact`

After each page, accumulated tool results grow the context window:

| Pages built | Approx accumulated context | Action |
|---|---|---|
| 1–2 | ~3,000 extra | Fine |
| 3–4 | ~6,000 extra | Consider `/compact` |
| 5+ | ~10,000+ extra | `/compact` recommended |

`/compact` collapses all prior history into a summary, resetting accumulated context
while preserving session knowledge (page IDs, field names, design decisions).

---

## Token Cost by Operation Type

| Operation | Cost tier | Reason |
|---|---|---|
| `set_report_theme` | 🟢 Cheap | 1 call, global effect |
| `apply_theme` | 🟢 Cheap | 1 call, whole page |
| `add_visual` batch | 🟢 Cheap | N visuals, 1 call |
| Inline `containerFormat` | 🟢 Free | No extra call |
| Inline `title` | 🟢 Free | No extra call |
| `list_pages` slim | 🟢 Cheap | ~40 tokens |
| `list_visuals` slim | 🟢 Cheap | ~30 tokens per visual |
| `format_visual` ×N | 🟡 Medium | 1 call per visual |
| `set_visual_title` ×N | 🟡 Medium | 1 call per visual |
| `get_visual` | 🟡 Medium | Returns full JSON |
| `list_visuals` slim=false | 🟡 Medium | Full position objects |
| Session tool schemas | 🔴 Fixed | ~12,000, unavoidable |

---

## Rules of Thumb

1. **Never format visuals individually** — use `apply_theme` + inline `containerFormat`
2. **Set titles inline** in `add_visual`, not via `set_visual_title` after
3. **Don't customise fonts/axes** unless explicitly asked — Power BI defaults are fine
4. **Read model once** — store field names mentally, don't re-read mid-session
5. **`/compact` every 3–4 pages** — biggest single lever for long sessions
6. **`set_report_theme` once per report** — not once per page
7. **Batch everything** — 1 `add_visual` with 13 visuals beats 13 `add_visual` calls

---

## Optimal Page Build — Call Sequence

```
Session start (once):
  set_report
  model read (tables + columns)
  set_report_theme        ← global brand, skip if already set

Per page:
  create_page
  add_visual (batch)      ← shapes first (wireframe)
  add_visual (batch)      ← all data visuals with inline titles
  apply_theme             ← container chrome, 1 call
  /compact every 3-4 pages

Session end:
  reload_report
```

**Total calls for a 13-visual page: 5–6**
**Total calls naive approach: 30+**
