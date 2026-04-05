# Token Comparison — MCP vs CLI vs Manual

All figures approximate. Based on Claude Sonnet ($3/M input, $15/M output).
Scenario: build pages with 4 KPIs + 5 slicers + 4 charts + wireframe shapes.

---

## How Each Approach Works

| | MCP (our server) | CLI (pbi-cli via bash) | Manual (raw JSON) |
|---|---|---|---|
| **Schema overhead** | ~12,000 (all tool defs) | ~500 (bash tool only) | ~500 (bash tool only) |
| **Batch operations** | ✅ N visuals in 1 call | ❌ 1 command per visual | ❌ 1 file write per visual |
| **Binding** | ✅ Inline with add_visual | ❌ Separate bind command each | ❌ Manual JSON construction |
| **Format** | ✅ apply_theme = 1 call | ❌ 1 command per visual | ❌ Manual JSON per visual |
| **Output verbosity** | Low (structured JSON) | Medium (CLI stdout) | High (full file contents) |
| **Error risk** | Low (validated) | Medium (CLI flags) | High (raw JSON) |

---

## Per-Page Variable Cost (1 page, 13 data visuals + 8 shapes)

### MCP — Recommended approach

| Step | Calls | Tokens |
|---|---|---|
| list_pages + create_page | 2 | ~150 |
| add_visual batch shapes | 1 | ~630 |
| add_visual batch data visuals (inline titles) | 1 | ~1,660 |
| apply_theme | 1 | ~50 |
| reload_report | 1 | ~35 |
| **Subtotal** | **6 calls** | **~2,525** |

### CLI (pbi-cli) — Same page

| Step | Calls | Tokens |
|---|---|---|
| `pbi report add-page` | 1 | ~100 |
| `pbi visual add` × 21 (shapes + visuals) | 21 | ~3,150 |
| `pbi visual bind` × 26 (avg 2 bindings each) | 26 | ~3,380 |
| `pbi report set-theme` | 1 | ~150 |
| `pbi report reload` | 1 | ~80 |
| **Subtotal** | **50 calls** | **~6,860** |

### Manual (file read/write) — Same page

| Step | Calls | Tokens |
|---|---|---|
| Read page.json, pages.json | 2 | ~400 |
| Write page.json | 1 | ~200 |
| Read + write visual.json × 21 | 42 | ~15,000 |
| Read/write report.json (theme) | 2 | ~800 |
| **Subtotal** | **47 calls** | **~16,400** |

---

## Full Session Cost (schema overhead + variable)

### Single page session

| Approach | Schema overhead | Variable | **Total** | Approx cost |
|---|---|---|---|---|
| MCP | 12,000 | 2,525 | **~14,525** | ~$0.05 |
| CLI | 500 | 6,860 | **~7,360** | ~$0.02 |
| Manual | 500 | 16,400 | **~16,900** | ~$0.06 |

> **CLI wins on a single page** — MCP schema overhead isn't justified yet.

---

### 3-page session

| Approach | Schema overhead | Variable (×3) | Context carry | **Total** | Approx cost |
|---|---|---|---|---|---|
| MCP | 12,000 | 7,575 | ~2,000 | **~21,575** | ~$0.07 |
| CLI | 500 | 20,580 | ~4,000 | **~25,080** | ~$0.08 |
| Manual | 500 | 49,200 | ~8,000 | **~57,700** | ~$0.19 |

> **Break-even at ~3 pages** — MCP and CLI roughly equal.

---

### 5-page session

| Approach | Schema overhead | Variable (×5) | Context carry | **Total** | Approx cost |
|---|---|---|---|---|---|
| MCP | 12,000 | 12,625 | ~5,000 | **~29,625** | ~$0.10 |
| CLI | 500 | 34,300 | ~10,000 | **~44,800** | ~$0.15 |
| Manual | 500 | 82,000 | ~18,000 | **~100,500** | ~$0.33 |

> **MCP wins from 5+ pages** — batching advantage compounds.

---

### 10-page session

| Approach | Schema overhead | Variable (×10) | Context carry | **Total** | Approx cost |
|---|---|---|---|---|---|
| MCP | 12,000 | 25,250 | ~15,000 | **~52,250** | ~$0.17 |
| CLI | 500 | 68,600 | ~25,000 | **~94,100** | ~$0.31 |
| Manual | 500 | 164,000 | ~40,000 | **~204,500** | ~$0.67 |

---

## Break-Even Chart

```
Tokens
 50k │                              CLI
     │                         ╱
 40k │                    CLI ╱
     │               ╱──────
 30k │          ╱───╱    MCP
     │     ╱───╱  ╱─────────────────
 20k │╱───╱ ╱────
     │    ╱  MCP (schema paid off)
 10k │───╱
     │
     └──────────────────────────────
       1    2    3    4    5   10  pages

MCP cheaper from ~3 pages onwards
```

---

## /compact — New Session With vs Without

Context accumulates across a session. Every new tool call input includes ALL prior messages.
By page 5 you're carrying ~5,000-8,000 tokens of prior tool results on every call.

### 5-page session — MCP, WITHOUT /compact

| Page | Context at start | Tool calls | Tokens this page |
|---|---|---|---|
| 1 | 12,500 (schemas) | 6 | ~15,000 |
| 2 | 14,000 | 6 | ~16,500 |
| 3 | 15,500 | 6 | ~18,000 |
| 4 | 17,000 | 6 | ~19,500 |
| 5 | 18,500 | 6 | ~21,000 |
| **Total** | | **30 calls** | **~90,000** |
| **Approx cost** | | | **~$0.30** |

---

### 5-page session — MCP, WITH /compact after page 3

| Page | Context at start | Tool calls | Tokens this page |
|---|---|---|---|
| 1 | 12,500 | 6 | ~15,000 |
| 2 | 14,000 | 6 | ~16,500 |
| 3 | 15,500 | 6 | ~18,000 |
| /compact | ~17,000 | 1 | ~17,000 |
| → after compact | ~13,500 (schemas + summary) | | |
| 4 | 13,500 | 6 | ~15,000 |
| 5 | 15,000 | 6 | ~16,500 |
| **Total** | | **31 calls** | **~98,000** |
| **Approx cost** | | | **~$0.27** |

> Saves ~$0.03 on 5 pages — modest. **Real value of /compact is on longer sessions.**

---

### 10-page session — MCP, WITHOUT /compact

| Pages | Avg context | Calls | Total tokens |
|---|---|---|---|
| 1–3 | ~14,500 | 18 | ~261,000 |
| 4–6 | ~18,000 | 18 | ~324,000 |
| 7–10 | ~22,000 | 24 | ~528,000 |
| **Total** | | **60 calls** | **~1,113,000** |
| **Approx cost** | | | **~$3.70** |

---

### 10-page session — MCP, WITH /compact every 3 pages

| Pages | Avg context | Calls | Total tokens |
|---|---|---|---|
| 1–3 | ~14,500 | 18 | ~261,000 |
| /compact | ~17,000 | 1 | ~17,000 |
| 4–6 | ~14,000 | 18 | ~252,000 |
| /compact | ~16,000 | 1 | ~16,000 |
| 7–9 | ~14,000 | 18 | ~252,000 |
| /compact | ~16,000 | 1 | ~16,000 |
| 10 | ~14,000 | 6 | ~84,000 |
| **Total** | | **63 calls** | **~898,000** |
| **Approx cost** | | | **~$2.98** |

> **Saves ~$0.72 on a 10-page session (~19%)**. Compounds heavily on larger reports.

---

## Summary Table

| Session size | MCP no compact | MCP + compact | CLI no compact | Winner |
|---|---|---|---|---|
| 1 page | ~$0.05 | — | ~$0.02 | CLI |
| 3 pages | ~$0.07 | — | ~$0.08 | MCP |
| 5 pages | ~$0.30 | ~$0.27 | ~$0.15 | CLI |
| 10 pages | ~$3.70 | ~$2.98 | ~$0.31 | CLI* |
| 10 pages (no format) | ~$0.17 | ~$0.14 | ~$0.31 | MCP |

> *CLI 10-page cost assumes no individual formatting. Add `pbi format` calls per visual
> and CLI cost jumps to ~$1.50+ for a 10-page formatted report — MCP wins again.

---

## When to Use Each Approach

| Scenario | Best approach |
|---|---|
| Quick single-page exploration | CLI |
| Full report build (3+ pages) | MCP |
| Heavily formatted report | MCP (`apply_theme` advantage) |
| Bulk binding updates | MCP (`update_visual_bindings`) |
| One-off page inspection | CLI (`pbi report get-page`) |
| Long session (5+ pages) | MCP + `/compact` every 3 pages |

---

## Key Rules for Efficiency

```
1. Single page or quick check  → CLI may be more efficient
2. Multi-page build            → MCP (batching pays off fast)
3. Any formatting              → MCP (apply_theme vs N CLI calls)
4. Long sessions               → /compact every 3 pages
5. Never                       → individual format_visual per visual
6. Never                       → manual JSON editing
```
