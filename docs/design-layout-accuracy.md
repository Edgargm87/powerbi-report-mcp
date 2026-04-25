<!-- doc-version: 1.0 | Status: DESIGN | Created: 2026-04-18 -->
# Design — Layout Accuracy Pass

Goal: stop the LLM from guessing at pixels. Every path from a loose prompt
("create a page based on domain/dataset") to a written PBIR visual should
either (a) take arithmetic away from the LLM, or (b) reject bad arithmetic
with a teaching error. Silent correction is explicitly off the table — the
LLM must be able to learn from the response.

Target client: Claude Code (supports `tools/list_changed`, so adding a tool
mid-session is fine). Claude Desktop benefits incidentally.

---

## 1. Decisions (answered in brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Error message format | **Structured teaching** (~80 tokens) — `{code, actual, limits, suggestion, rule, guide}` |
| 2 | Strict-layout default | **On by default**, `strictLayout:false` per-call escape hatch |
| 3 | `pbir_layout_grid` shape | **Plan→commit two-phase by default** (`planOnly:true`), `planOnly:false` single-shot for power users |
| 4 | Skill pointers in errors | **Yes** — every error carries a `pbir_guide` field referencing `guide('wireframes')` or similar |
| 5 | Strict-gate scope | **Block 7 rules, warn on column alignment only** (see table below) |

---

## 2. Scope — what ships in this pass

### 2a. Three surface changes

1. **`pbir_add_visual` gains write-time wireframe validation** with strict default.
2. **New tool: `pbir_layout_grid`** — grid-primitive layout with plan→commit flow.
3. **Canvas dimensions surfaced** in `pbir_create_page`, `pbir_list_pages`, `get_page_summary` responses.

### 2b. Out of scope (deferred)

- Relative anchors (`anchor:"visualId", side:"right"`) — user doesn't test cascading edits.
- Named taste templates (`"executive-summary"`) — `pbir_layout_grid` covers this need.
- Canvas-percent coords (`x:"50%"`) — overlaps with `pbir_layout_grid`.
- `draft_page_wireframe` as a distinct tool — `pbir_layout_grid` with `planOnly:true`
  is functionally equivalent. One tool, two modes.

---

## 3. Error format contract

Single shape, used by `pbir_add_visual` strict-mode rejections, `pbir_layout_grid` plan
validation, and any future layout-touching tool.

```ts
interface LayoutError {
  /** Machine-readable error code — stable string, suitable for switch statements. */
  code:
    | "out_of_bounds_right"
    | "out_of_bounds_bottom"
    | "overlap"
    | "wrong_left_margin"
    | "wrong_right_margin"
    | "wrong_bottom_margin"
    | "wrong_horizontal_gap"
    | "wrong_vertical_gap"
    | "silent_default_position"
    | "rounding_overflow"
    | "banner_position"
    | "banner_width"
    | "negative_dimension";

  /** Which visual(s) triggered the error. */
  visualId?: string;
  visualIds?: string[]; // for overlap / gap errors involving two visuals

  /** The position values the LLM sent. */
  actual: { x: number; y: number; width: number; height: number };

  /** The constraint it violated, with actual numbers. */
  limits: Record<string, number>; // e.g. { maxX: 1250, usableWidth: 1250 }

  /** Actionable fix in plain English. */
  suggestion: string; // "Reduce width to 50 (keep x=1200) OR move x to 1150."

  /** The underlying rule. Repeated across calls so the LLM generalises. */
  rule: string; // "x + width must be ≤ 1250 (15px L/R margins on 1280 canvas)"

  /** Where to read more. */
  guide: string; // "guide('wireframes')"
}
```

**Example response when strict-mode `pbir_add_visual` rejects a write:**

```json
{
  "success": false,
  "error": "layout_validation_failed",
  "mode": "strict",
  "canvas": {
    "width": 1280, "height": 720,
    "usableWidth": 1250, "usableHeight": 714,
    "margins": { "L": 15, "R": 15, "T": 0, "B": 6 },
    "gap": 5
  },
  "layoutErrors": [
    {
      "code": "out_of_bounds_right",
      "visualId": "kpi_margin",
      "actual":  { "x": 1200, "y": 40, "width": 100, "height": 120 },
      "limits":  { "maxRightEdge": 1250, "yourRightEdge": 1300 },
      "suggestion": "Reduce width to 50 (keep x=1200) OR move x to 1150 (keep width=100).",
      "rule": "x + width must be ≤ 1250 (15px L/R margins on a 1280px canvas).",
      "pbir_guide": "guide('wireframes')"
    }
  ]
}
```

---

## 4. Strict-gate rule table

Reuses the validator codes in `src/wireframe-validator.ts`. Mapping:

| Validator code | Severity | Strict mode | Notes |
|---|---|---|---|
| `OUT_OF_BOUNDS` | error | **block** | x+w > 1250 or y+h > 714 |
| `OVERLAP` | error | **block** | Two visuals' rects intersect |
| `LEFT_MARGIN` | error | **block** | x < 15 |
| `RIGHT_MARGIN` | error | **block** | x+w > 1265 (treated same as OOB for simplicity) |
| `BOTTOM_MARGIN` | error | **block** | y+h > 714 |
| `WRONG_GAP_H` | error | **block** | Horizontal gap ≠ 5px |
| `WRONG_GAP_V` | error | **block** | Vertical gap ≠ 5px |
| `SILENT_DEFAULT` | error | **block** | Visual at (0,0) with no explicit coords |
| `ROUNDING_OVERFLOW` | error | **block** | Sum of widths + gaps > 1250 by ≤ 2px |
| `BANNER_POSITION` / `BANNER_WIDTH` | error | **block** | Banner visual not at x:0,w:1280 |
| `NEGATIVE_DIMENSION` | error | **block** | width ≤ 0 or height ≤ 0 |
| `COLUMN_MISALIGN` | warning | **warn only** | Row 1 cols don't align to row 0 cols; legitimate with spans |
| `ROW_MISALIGN` | warning | **warn only** | Same reasoning |

**Escape hatch:** `strictLayout: false` on `pbir_add_visual` or `pbir_layout_grid` downgrades
every blocking error to a warning. Same semantics as `strictBindings`.

---

## 5. API — `pbir_add_visual` (modified)

No new required parameters. One new optional:

```ts
{
  strictLayout?: boolean  // default: true
                          // false = warn-only, writes always succeed
                          // undefined → env MCP_LAYOUT_VALIDATION (strict|warn|off)
}
```

**Three-mode env var** mirroring `MCP_BINDING_VALIDATION`:
- `strict` (default) — block on any error-severity issue
- `warn` — always write, return warnings
- `off` — skip validation entirely (legacy behaviour)

**Response shape additions (success case):**

```json
{
  "success": true,
  "visualId": "...",
  // when warnings produced (any mode that wrote)
  "layoutWarnings": [ /* LayoutError[], warn severity */ ],
  // surfaced in every success response
  "canvas": { "width":1280, "height":720, "usableWidth":1250, "usableHeight":714, ... }
}
```

---

## 6. API — `pbir_layout_grid` (new tool)

### 6a. Input schema

```ts
{
  pageId: string;

  // Grid shape
  rows: number;           // ≥1
  cols: number;           // ≥1
  gaps?: number;          // default 5 (both h + v)
  margins?: {             // default = CANVAS defaults (15/15/0/6)
    left?: number; right?: number; top?: number; bottom?: number;
  };
  reserveBannerRow?: boolean;  // default false — if true, row 0 is skipped for banner at y:0,h:52

  // Cells
  cells: Array<{
    row: number;          // 0-indexed
    col: number;          // 0-indexed
    rowSpan?: number;     // default 1
    colSpan?: number;     // default 1

    // Visual content — same shape as pbir_add_visual's nested form
    visualType: string;
    title?: string;
    bindings?: BucketBinding[];
    format?: Record<string, unknown>;
    dataColors?: string[];
    // ... any other pbir_add_visual field
  }>;

  planOnly?: boolean;        // default TRUE — return plan, don't write
  strictLayout?: boolean;    // default true — applies to the computed plan
  autoFilters?: boolean;     // default true, passed through to pbir_add_visual
}
```

### 6b. `planOnly:true` (default) — returns a plan

```json
{
  "success": true,
  "mode": "plan",
  "canvas": { /* as above */ },
  "grid": { "rows": 2, "cols": 3, "gaps": 5, "margins": { ... } },
  "cellGeometry": {
    "cellWidth":  413.33,   // raw math
    "cellHeight": 351.5,
    "roundingStrategy": "distribute-1px-remainders-to-first-N-cells"
  },
  "plan": [
    {
      "slotRef": "r0c0",
      "x": 15, "y": 0, "width": 414, "height": 351,
      "visualType": "card",
      "title": "Revenue",
      "bindings": [ /* ... */ ]
    },
    {
      "slotRef": "r0c1",
      "x": 434, "y": 0, "width": 413, "height": 351,
      "visualType": "card",
      "title": "Margin"
    }
    // ...
  ],
  "validated": {
    "ok": true,
    "errors": 0,
    "warnings": 0,
    "coverage": 98.7
  },
  "nextStep": "Call pbir_layout_grid again with planOnly:false (or pbir_add_visual for each plan entry) to commit."
}
```

**Key: `x/y/w/h` are surfaced so the LLM *sees* the numbers.** That's the
learning channel. After 3 pages the LLM can do the 5-column split from memory.

### 6c. `planOnly:false` — writes directly

Server computes the plan (same math), validates, and if validation passes,
calls `pbir_add_visual` for each cell. Returns the same response plus `ids:[...]`.

If validation fails in strict mode: returns the plan + `layoutErrors:[]`,
no writes.

### 6d. Grid math (normative)

```
available_w = canvas.usableWidth  - margins.left - margins.right   // typically 1250
available_h = canvas.usableHeight - margins.top  - margins.bottom  // typically 714
              - (reserveBannerRow ? canvas.bannerHeight + gap : 0)

raw_cw = (available_w - (cols-1)*gap) / cols
raw_ch = (available_h - (rows-1)*gap) / rows
cw = floor(raw_cw)
ch = floor(raw_ch)
remainder_w = available_w - (cols-1)*gap - cw*cols   // 0..cols-1 extra pixels
remainder_h = available_h - (rows-1)*gap - ch*rows

// Distribute remainder by giving first `remainder_w` cells an extra pixel of width.
// (Same for height on first `remainder_h` rows.)
// This guarantees sum(widths) + (cols-1)*gap == available_w exactly.
```

For a cell at (r, c) with spans (rs, cs):

```
x = margins.left + sum(widths[0..c-1]) + c*gap
y = margins.top  + (reserveBannerRow ? bannerHeight + gap : 0)
                 + sum(heights[0..r-1]) + r*gap
w = sum(widths[c..c+cs-1]) + (cs-1)*gap
h = sum(heights[r..r+rs-1]) + (rs-1)*gap
```

This math is **deterministic** and the same for any (rows, cols, gaps,
margins) — easy to unit test with concrete fixtures.

### 6e. Validation rules specific to `pbir_layout_grid`

- `cells[].row < rows` and `cells[].col < cols`. Otherwise `cell_out_of_grid`.
- `row + rowSpan <= rows`, `col + colSpan <= cols`. Otherwise `span_overflow_grid`.
- No two cells may occupy the same (r,c). Otherwise `cell_collision` (pre-geometry).
- Empty cells allowed — not every slot must be filled.
- After geometry is computed, run `validateWireframe()` on the full plan.

---

## 7. Canvas dims surfaced on read tools

Zero-cost addition to three existing tools:

**`pbir_create_page` response** (currently returns `{success, pageId}`):
```json
{ "success": true, "pageId": "...", "canvas": { /* CANVAS constants */ } }
```

**`pbir_list_pages` response** — add top-level `canvas` once (not per page — same for all).

**`get_page_summary` response** — add `canvas` alongside existing fields.

No breaking changes (additive).

---

## 8. Files touched

| File | Change |
|---|---|
| `src/helpers/layoutValidation.ts` | **NEW.** Wraps `validateWireframe` in the strict/warn/off policy shape; produces `LayoutError[]` from `WireframeIssue[]`; converts severity per rule table §4. |
| `src/tools/visuals.ts` | `pbir_add_visual` gains `strictLayout` param + pre-write validation call. On reject: return `layoutErrors` response. On write success: include `canvas` + `layoutWarnings`. |
| `src/tools/layoutGrid.ts` | **NEW.** The `pbir_layout_grid` tool registration. Grid math, validation, plan-vs-commit branch. |
| `src/index.ts` | Register `pbir_layout_grid` (on-demand by default; make core once proven). |
| `src/default-tools.ts` | No change initially. Consider promoting `pbir_layout_grid` to default after beta. |
| `src/tools/pages.ts` | `pbir_create_page` returns `canvas`. |
| `src/tools/pages.ts` or `src/tools/visuals.ts` | `pbir_list_pages` / `get_page_summary` return `canvas`. |
| `skills/wireframes.md` | Add a "pbir_layout_grid" section with 3 worked examples (2×3 dashboard, banner+content, hero+sidebar). |
| `scripts/test-layout-validator.js` | **NEW.** Mirror of `test-binding-validator.js` — 25+ cases covering every `LayoutError.code`. |
| `scripts/test-layout-grid.js` | **NEW.** Grid-math unit tests: 1×1, 2×3, 5×1 with banner, edge-gap-span cases, rounding remainder distribution. |
| `.githooks/pre-commit` | Add both new test scripts to the gate. |
| `.github/workflows/ci.yml` | Same. |
| `package.json` | New scripts `test:layout`, `test:grid`; added to `test:all`. |
| `README.md` | Add "Layout validation" section near "Smart Tool Loading". |
| `src/index.ts` PBIR_INSTRUCTIONS | One sentence: "When building a fresh page from scratch, prefer `pbir_layout_grid` with `planOnly:true` over calling `pbir_add_visual` multiple times." |

---

## 9. Env-var contract

```
MCP_LAYOUT_VALIDATION = "strict" | "warn" | "off"
```
- Unset or `"strict"` → strict default.
- `"warn"` → blocking errors downgraded to warnings, writes proceed.
- `"off"` → validation skipped entirely (legacy behaviour for users who hate it).

Per-call `strictLayout:true|false|undefined` overrides the env, matching the
existing `strictBindings` pattern.

---

## 10. Test plan

### 10a. `test-layout-validator.js`
- `STRICT 1..12` — one case per validator code, verifies `proceed=false` in strict mode.
- `WARN 1..12` — same cases, `mode:warn`, verifies writes proceed with warnings.
- `OFF 1..3` — spot checks that `mode:off` skips validation.
- `SKIP 1..3` — missing canvas (shouldn't happen but defensive).
- `RESPONSE 1..4` — `LayoutError` shape contract: every field present, `suggestion`
  non-empty, `rule` non-empty, `pbir_guide` present.

### 10b. `test-layout-grid.js`
- `MATH 1..8` — 1×1, 1×2, 2×1, 2×3, 3×3, 5×1, 1×5, 2×3 with banner row.
- `SPANS 1..4` — colSpan, rowSpan, both, overlapping spans (must fail).
- `ROUNDING 1..3` — remainder distribution hits exact sums.
- `MARGINS 1..3` — custom margins, custom gaps.
- `VALIDATION 1..5` — grid produces layouts the wireframe-validator accepts.
- `PLAN_ONLY 1..2` — plan mode returns `plan[]`, commit mode writes.

### 10c. Regression
- Existing `test-wireframe.js` must still pass unchanged (validator unchanged).
- Existing `test-binding-validator.js` must still pass (no overlap with layout).

---

## 11. Sequencing

Implement in three slices so value lands early and each slice is independently shippable.

### Slice 1 — Canvas exposure + write-time validator (arithmetic accountability)
Smallest diff, biggest immediate win.
- New `src/helpers/layoutValidation.ts`.
- `pbir_add_visual` wired in (strict default, env-var, per-call override).
- Canvas dims on `pbir_create_page` / `pbir_list_pages` / `get_page_summary`.
- `test-layout-validator.js` + CI gate.
- README + skill updates.

**Exit criterion:** LLM can no longer commit a bad position silently.
Pre-commit + CI green.

### Slice 2 — `pbir_layout_grid` plan mode
- New `src/tools/layoutGrid.ts` with `planOnly:true` only.
- Grid math + validation.
- `test-layout-grid.js`.
- Skill update with 3 worked examples.

**Exit criterion:** LLM builds a 2×3 dashboard in one plan call; we verify the
computed coords pass the wireframe-validator and match canonical layouts.

### Slice 3 — `pbir_layout_grid` commit mode
- `planOnly:false` branch writes visuals by reusing `pbir_add_visual`'s core logic.
- End-to-end test: plan → commit → `pbir_list_visuals` shows the right shape.

**Exit criterion:** loose prompt ("build a sales dashboard") produces a
valid page in one or two tool calls, with the LLM seeing the numbers.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Strict default breaks existing working flows | `MCP_LAYOUT_VALIDATION=warn` env escape, per-call `strictLayout:false`, one changelog entry loud about the behaviour change. |
| Validator false positives on legitimate-but-weird layouts (posters, screensavers) | Keep `COLUMN_MISALIGN` as warn-only. Document the escape hatches prominently. |
| `pbir_layout_grid` grid math has edge cases on narrow/tall canvases | Unit-test with the CANVAS constants and 2–3 alternate canvas sizes. Don't support non-default canvas for v1. |
| Two-phase (plan→commit) increases round trips | Single-shot mode (`planOnly:false`) exists for token-sensitive users. Default to plan because the learning win is larger. |
| Error messages balloon token usage on bad LLMs | Structured LayoutError is ~80 tokens; bad LLMs making 10 errors/page is 800 tokens. Compare to the thousand-token recovery loops when they commit broken layouts and have to re-read the report. Net win. |
| Backward compatibility with scripts that pass bad positions on purpose | `strictLayout:false` per-call, `MCP_LAYOUT_VALIDATION=off` globally. Tests for both. |

---

## 13. Success metrics

- **Zero silently-broken layouts.** Every bad position either fails the call
  or appears in `layoutWarnings` — never ships invisibly.
- **LLM self-correction rate.** On a sample of 10 "build a page from prompt"
  sessions: measure how often the LLM succeeds on the first try vs. first-retry.
  Target: >70% first-try with `pbir_layout_grid`, up from ~20% today.
- **Skill read reduction.** LLMs currently read `skills/wireframes.md` often
  because they're unsure. Post-ship, the error messages should carry enough
  context that `guide('wireframes')` calls drop.
- **Coverage in validator test suite:** ≥30 cases, 100% code branch coverage on
  `layoutValidation.ts`.

---

## 14. Open / deferred

- **Non-default canvas sizes** (1920×1080, 16:10, portrait) — out of scope for v1.
  The CANVAS constants are shared; extending is a later PR.
- **`pbir_layout_grid` promotion to default tool set** — ship on-demand first,
  promote after a release's worth of feedback.
- **Automatic grid inference** — given an existing page, offer to reverse-engineer
  its grid. Future nice-to-have.
- **Error-message localisation** — English only for v1.

---

## Handoff

This document is the spec. Next step is `/sc:implement` with explicit slice
scope (recommend starting with **Slice 1** — write-time validator + canvas
exposure, since it lands the biggest user-visible win for the smallest diff).
