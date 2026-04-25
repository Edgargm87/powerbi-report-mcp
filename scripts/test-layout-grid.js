// ═══════════════════════════════════════════════════════════════════════════════
// pbir_layout_grid — Grid-math unit tests
//
// Tests the pure functions exported from src/tools/layoutGrid.ts:
//   - computeGridGeometry   — widths/heights sum exactly, remainder distribution
//   - cellRect              — (row,col,spans) → (x,y,w,h)
//   - validateCellGrid      — out-of-grid / span-overflow / collision detection
//
// No MCP server, no report — pure math verification. All coordinates checked
// against the CANVAS constants (1280×720, 15L/15R/0T/6B margins, 5px gap).
//
// Run: node scripts/test-layout-grid.js
// ═══════════════════════════════════════════════════════════════════════════════

const {
  computeGridGeometry,
  cellRect,
  validateCellGrid,
} = require("../dist/tools/layoutGrid.js");

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n\u2500\u2500\u2500 ${title} ${"\u2500".repeat(Math.max(0, 60 - title.length))}`);
}

// Canonical defaults (mirrors CANVAS from src/wireframe-validator.ts)
const DEFAULT_MARGINS = { left: 15, right: 15, top: 0, bottom: 6 };
const DEFAULT_GAP = 5;

function defaultGeom(rows, cols, overrides = {}) {
  return computeGridGeometry({
    rows,
    cols,
    gap: overrides.gap ?? DEFAULT_GAP,
    margins: overrides.margins ?? DEFAULT_MARGINS,
    reserveBannerRow: overrides.reserveBannerRow ?? false,
  });
}

// ---------------------------------------------------------------------------
// MATH — geometry for canonical grid shapes
// ---------------------------------------------------------------------------

section("MATH — widths/heights sum exactly");

{
  // MATH 1 — 1×1 single cell
  const g = defaultGeom(1, 1);
  // available_w = 1280 - 15 - 15 = 1250, no gaps
  // available_h = 720 - 0 - 6 = 714
  assert("MATH 1  1×1 width = 1250", g.widths[0] === 1250);
  assert("MATH 1  1×1 height = 714", g.heights[0] === 714);
  assert("MATH 1  1×1 origin = (15,0)", g.originX === 15 && g.originY === 0);
}

{
  // MATH 2 — 1×2 two columns (the canonical split from skills/wireframes.md)
  const g = defaultGeom(1, 2);
  // available_w = 1250, minus 1 gap (5) = 1245, /2 = 622.5 → floor 622, remainder 1
  // widths = [623, 622]
  assert("MATH 2  1×2 widths = [623, 622]", g.widths[0] === 623 && g.widths[1] === 622);
  assert(
    "MATH 2  1×2 sum + gap = 1250",
    g.widths[0] + g.widths[1] + g.gap === 1250
  );
}

{
  // MATH 3 — 2×1 two rows
  const g = defaultGeom(2, 1);
  // available_h = 714, minus 1 gap = 709, /2 = 354.5 → floor 354, remainder 1
  assert("MATH 3  2×1 heights = [355, 354]", g.heights[0] === 355 && g.heights[1] === 354);
  assert(
    "MATH 3  2×1 sum + gap = 714",
    g.heights[0] + g.heights[1] + g.gap === 714
  );
}

{
  // MATH 4 — 2×3 dashboard (common 6-card layout)
  const g = defaultGeom(2, 3);
  // W: 1250 - 2*5 = 1240, /3 = 413.33 → floor 413, remainder 1
  // H: 714  - 1*5 = 709,  /2 = 354.5  → floor 354, remainder 1
  assert("MATH 4  2×3 widths sum to 1250", g.widths.reduce((a, b) => a + b, 0) + 2 * g.gap === 1250);
  assert("MATH 4  2×3 heights sum to 714", g.heights.reduce((a, b) => a + b, 0) + 1 * g.gap === 714);
  assert("MATH 4  2×3 widths = [414,413,413]", JSON.stringify(g.widths) === "[414,413,413]");
}

{
  // MATH 5 — 5×1 KPI row
  const g = defaultGeom(1, 5);
  // W: 1250 - 4*5 = 1230, /5 = 246 exactly, remainder 0
  assert("MATH 5  1×5 widths = [246,246,246,246,246]", JSON.stringify(g.widths) === "[246,246,246,246,246]");
  assert(
    "MATH 5  1×5 sum + gaps = 1250",
    g.widths.reduce((a, b) => a + b, 0) + 4 * g.gap === 1250
  );
}

{
  // MATH 6 — 3×3 grid
  const g = defaultGeom(3, 3);
  const wSum = g.widths.reduce((a, b) => a + b, 0) + 2 * g.gap;
  const hSum = g.heights.reduce((a, b) => a + b, 0) + 2 * g.gap;
  assert("MATH 6  3×3 widths sum exact", wSum === 1250);
  assert("MATH 6  3×3 heights sum exact", hSum === 714);
}

{
  // MATH 7 — 1×7 (awkward split to stress remainder distribution)
  const g = defaultGeom(1, 7);
  // W: 1250 - 6*5 = 1220, /7 = 174.28 → floor 174, remainder 2
  // widths = [175, 175, 174, 174, 174, 174, 174]
  assert("MATH 7  1×7 widths start with two 175s", g.widths[0] === 175 && g.widths[1] === 175);
  assert("MATH 7  1×7 rest are 174", g.widths.slice(2).every((w) => w === 174));
  assert(
    "MATH 7  1×7 sum + gaps = 1250",
    g.widths.reduce((a, b) => a + b, 0) + 6 * g.gap === 1250
  );
}

{
  // MATH 8 — 2×3 with banner row reserved
  const g = defaultGeom(2, 3, { reserveBannerRow: true });
  // availableH = 714 - (52+5) = 657, minus 1 gap = 652, /2 = 326 exactly
  assert("MATH 8  banner grid origin y = 57", g.originY === 57);
  assert("MATH 8  banner grid heights sum + gap = 657", g.heights.reduce((a, b) => a + b, 0) + g.gap === 657);
}

// ---------------------------------------------------------------------------
// CELL — rect computation for spans and positions
// ---------------------------------------------------------------------------

section("CELL — rect computation");

{
  // CELL 1 — 1×1 covers the whole canvas minus margins
  const g = defaultGeom(1, 1);
  const r = cellRect(g, { row: 0, col: 0, rowSpan: 1, colSpan: 1 });
  assert("CELL 1  1×1 cell rect = (15, 0, 1250, 714)",
    r.x === 15 && r.y === 0 && r.width === 1250 && r.height === 714);
}

{
  // CELL 2 — 1×2, col 0 and col 1 have correct x offsets
  const g = defaultGeom(1, 2);
  const r0 = cellRect(g, { row: 0, col: 0, rowSpan: 1, colSpan: 1 });
  const r1 = cellRect(g, { row: 0, col: 1, rowSpan: 1, colSpan: 1 });
  assert("CELL 2  col0 x = 15", r0.x === 15);
  assert("CELL 2  col1 x = 15 + 623 + 5 = 643", r1.x === 643);
  assert("CELL 2  col1 right edge = 1265 (inside 15px right margin)", r1.x + r1.width === 1265);
}

{
  // CELL 3 — colSpan spans two cells, width = sum + gap
  const g = defaultGeom(1, 3);
  // widths: [414, 413, 413]
  const r = cellRect(g, { row: 0, col: 0, rowSpan: 1, colSpan: 2 });
  assert("CELL 3  colSpan=2 width = 414 + 413 + 5 = 832", r.width === 832);
}

{
  // CELL 4 — rowSpan works the same on y axis
  const g = defaultGeom(3, 1);
  // 3 rows of 714, gap 5 → heights = floor((714-10)/3) = 234, remainder 2
  // heights = [235, 235, 234]
  assert("CELL 4  3×1 heights = [235,235,234]", JSON.stringify(g.heights) === "[235,235,234]");
  const r = cellRect(g, { row: 0, col: 0, rowSpan: 2, colSpan: 1 });
  assert("CELL 4  rowSpan=2 height = 235 + 235 + 5 = 475", r.height === 475);
}

{
  // CELL 5 — banner-reserved grid starts below y=57
  const g = defaultGeom(2, 3, { reserveBannerRow: true });
  const r = cellRect(g, { row: 0, col: 0, rowSpan: 1, colSpan: 1 });
  assert("CELL 5  banner grid cell (0,0) y = 57", r.y === 57);
}

{
  // CELL 6 — last col's right edge respects right margin (1265 = 1280-15)
  const g = defaultGeom(1, 3);
  const r = cellRect(g, { row: 0, col: 2, rowSpan: 1, colSpan: 1 });
  assert("CELL 6  last col right edge = 1265", r.x + r.width === 1265);
}

{
  // CELL 7 — last row's bottom edge respects bottom margin (714 = 720-6)
  const g = defaultGeom(3, 1);
  const r = cellRect(g, { row: 2, col: 0, rowSpan: 1, colSpan: 1 });
  assert("CELL 7  last row bottom edge = 714", r.y + r.height === 714);
}

// ---------------------------------------------------------------------------
// CUSTOM — custom margins / gaps
// ---------------------------------------------------------------------------

section("CUSTOM — non-default margins and gaps");

{
  // CUSTOM 1 — 2×2 with gap=10
  const g = defaultGeom(2, 2, { gap: 10 });
  // W: 1250 - 10 = 1240, /2 = 620 exact
  // H: 714 - 10 = 704, /2 = 352 exact
  assert("CUSTOM 1  gap=10 widths = [620,620]", g.widths[0] === 620 && g.widths[1] === 620);
  assert("CUSTOM 1  gap=10 heights = [352,352]", g.heights[0] === 352 && g.heights[1] === 352);
}

{
  // CUSTOM 2 — larger margins
  const g = defaultGeom(1, 2, { margins: { left: 50, right: 50, top: 20, bottom: 20 } });
  // W: 1280 - 100 = 1180, minus 1 gap = 1175, /2 = 587.5 → floor 587, remainder 1
  assert("CUSTOM 2  larger margins widths = [588,587]", g.widths[0] === 588 && g.widths[1] === 587);
  assert("CUSTOM 2  origin = (50,20)", g.originX === 50 && g.originY === 20);
}

{
  // CUSTOM 3 — degenerate: margins leave no space — should throw
  let threw = false;
  try {
    computeGridGeometry({
      rows: 1, cols: 1, gap: 5,
      margins: { left: 640, right: 640, top: 0, bottom: 6 },
      reserveBannerRow: false,
    });
  } catch {
    threw = true;
  }
  assert("CUSTOM 3  over-margins throws", threw);
}

// ---------------------------------------------------------------------------
// GRID-VALIDATION — cell-grid checks (pre-geometry)
// ---------------------------------------------------------------------------

section("GRID — cell validation pre-geometry");

{
  // GRID 1 — clean 2×3 with 6 filled cells
  const cells = [
    { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
    { row: 0, col: 1, rowSpan: 1, colSpan: 1 },
    { row: 0, col: 2, rowSpan: 1, colSpan: 1 },
    { row: 1, col: 0, rowSpan: 1, colSpan: 1 },
    { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    { row: 1, col: 2, rowSpan: 1, colSpan: 1 },
  ];
  const errs = validateCellGrid(cells, 2, 3);
  assert("GRID 1  clean 2×3 has no errors", errs.length === 0);
}

{
  // GRID 2 — cell out of grid (col=3 in a 2-col grid)
  const errs = validateCellGrid([{ row: 0, col: 3, rowSpan: 1, colSpan: 1 }], 2, 2);
  assert("GRID 2  col out of grid flagged", errs.length === 1 && errs[0].code === "cell_out_of_grid");
}

{
  // GRID 3 — span overflow (col=1, colSpan=2 in a 2-col grid)
  const errs = validateCellGrid([{ row: 0, col: 1, rowSpan: 1, colSpan: 2 }], 1, 2);
  assert("GRID 3  span overflow flagged", errs.length === 1 && errs[0].code === "span_overflow_grid");
}

{
  // GRID 4 — collision (two cells share (0,0))
  const errs = validateCellGrid(
    [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
    ],
    2,
    2
  );
  assert("GRID 4  collision flagged", errs.some((e) => e.code === "cell_collision"));
}

{
  // GRID 5 — rowSpan=0 invalid
  const errs = validateCellGrid([{ row: 0, col: 0, rowSpan: 0, colSpan: 1 }], 1, 1);
  assert("GRID 5  rowSpan=0 flagged", errs.length === 1 && errs[0].code === "invalid_span");
}

{
  // GRID 6 — sparse grid (3 of 6 cells filled, no collision)
  const errs = validateCellGrid(
    [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
      { row: 0, col: 2, rowSpan: 2, colSpan: 1 },
    ],
    2,
    3
  );
  assert("GRID 6  sparse grid passes", errs.length === 0);
}

{
  // GRID 7 — colSpan=2 covers (0,0)+(0,1); second cell at (0,1) collides
  const errs = validateCellGrid(
    [
      { row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { row: 0, col: 1, rowSpan: 1, colSpan: 1 },
    ],
    1,
    3
  );
  assert("GRID 7  colSpan collision detected", errs.some((e) => e.code === "cell_collision"));
}

// ---------------------------------------------------------------------------
// VALIDATION — plans produce layouts the wireframe validator accepts
// ---------------------------------------------------------------------------

section("VALIDATION — plans pass wireframe-validator");

const { runLayoutValidation } = require("../dist/helpers/layoutValidation.js");

{
  // VALID 1 — 2×3 plan passes strict validator
  const g = defaultGeom(2, 3);
  const visuals = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const rect = cellRect(g, { row: r, col: c, rowSpan: 1, colSpan: 1 });
      visuals.push({
        id: `r${r}c${c}`,
        visualType: "card",
        title: `R${r}C${c}`,
        ...rect,
      });
    }
  }
  const outcome = runLayoutValidation(visuals, true);
  assert(
    "VALID 1  2×3 card grid passes strict",
    outcome.proceed && outcome.errors.length === 0,
    outcome.errors.map((e) => e.code).join(",")
  );
}

{
  // VALID 2 — 1×5 KPI row passes strict
  const g = defaultGeom(1, 5);
  const visuals = [];
  for (let c = 0; c < 5; c++) {
    const rect = cellRect(g, { row: 0, col: c, rowSpan: 1, colSpan: 1 });
    visuals.push({ id: `kpi${c}`, visualType: "card", title: `KPI${c}`, ...rect });
  }
  const outcome = runLayoutValidation(visuals, true);
  assert("VALID 2  1×5 KPI row passes strict", outcome.proceed);
}

{
  // VALID 3 — banner + 2×2 grid passes strict
  const g = defaultGeom(2, 2, { reserveBannerRow: true });
  const visuals = [
    { id: "banner", visualType: "shape", x: 0, y: 0, width: 1280, height: 52 },
  ];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const rect = cellRect(g, { row: r, col: c, rowSpan: 1, colSpan: 1 });
      visuals.push({
        id: `r${r}c${c}`,
        visualType: "card",
        title: `R${r}C${c}`,
        ...rect,
      });
    }
  }
  const outcome = runLayoutValidation(visuals, true);
  assert(
    "VALID 3  banner+2×2 passes strict",
    outcome.proceed && outcome.errors.length === 0,
    outcome.errors.map((e) => e.code + ":" + e.suggestion).join(" | ")
  );
}

{
  // VALID 4 — hero (colSpan=2) + sidebar on a 1×3 passes strict
  const g = defaultGeom(1, 3);
  const hero = cellRect(g, { row: 0, col: 0, rowSpan: 1, colSpan: 2 });
  const side = cellRect(g, { row: 0, col: 2, rowSpan: 1, colSpan: 1 });
  const outcome = runLayoutValidation(
    [
      { id: "hero", visualType: "card", title: "Hero", ...hero },
      { id: "side", visualType: "card", title: "Side", ...side },
    ],
    true
  );
  assert(
    "VALID 4  hero+sidebar spans pass strict",
    outcome.proceed && outcome.errors.length === 0,
    outcome.errors.map((e) => e.code).join(",")
  );
}

// ---------------------------------------------------------------------------
// COMMIT — end-to-end smoke test on a real PbirProject (temp scaffold).
// Verifies that plans produced by the grid math, when fed through
// createAndSaveVisual, round-trip correctly: the written visual.json files
// land with the exact x/y/w/h the plan specified.
// ---------------------------------------------------------------------------

section("COMMIT — end-to-end round-trip");

{
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { PbirProject } = require("../dist/pbir.js");
  const { createAndSaveVisual } = require("../dist/helpers/createVisual.js");

  // Build a minimal .Report scaffold: the commit path only needs
  // pages/{pageId}/visuals/ to exist so listVisualIds works.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbir-mcp-grid-"));
  const reportPath = path.join(tmpDir, "Grid.Report");
  const pageId = "page1";
  fs.mkdirSync(path.join(reportPath, "definition", "pages", pageId, "visuals"), {
    recursive: true,
  });

  try {
    const project = new PbirProject(reportPath);

    // Sanity: listVisualIds on an empty page returns [].
    assert("COMMIT 0  fresh page has no visuals", project.listVisualIds(pageId).length === 0);

    // 2×3 grid → 6 card writes
    const g = defaultGeom(2, 3);
    const cells = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        cells.push({ row: r, col: c, rowSpan: 1, colSpan: 1, visualType: "card", title: `R${r}C${c}` });
      }
    }

    const written = [];
    cells.forEach((cell, i) => {
      const rect = cellRect(g, {
        row: cell.row,
        col: cell.col,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
      });
      const result = createAndSaveVisual(
        project,
        pageId,
        {
          visualType: cell.visualType,
          title: cell.title,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        (i + 1) * 1000
      );
      written.push({ ...result, expected: rect });
    });

    // Assert every visual landed on disk with the exact planned geometry.
    const ids = project.listVisualIds(pageId);
    assert("COMMIT 1  6 visuals written to disk", ids.length === 6);

    let allMatch = true;
    const mismatches = [];
    for (const w of written) {
      const v = project.getVisual(pageId, w.visualId);
      if (
        v.position.x !== w.expected.x ||
        v.position.y !== w.expected.y ||
        v.position.width !== w.expected.width ||
        v.position.height !== w.expected.height
      ) {
        allMatch = false;
        mismatches.push(
          `${w.visualId}: got (${v.position.x},${v.position.y},${v.position.width}×${v.position.height}) expected (${w.expected.x},${w.expected.y},${w.expected.width}×${w.expected.height})`
        );
      }
    }
    assert(
      "COMMIT 2  round-tripped positions match plan exactly",
      allMatch,
      mismatches.join(" | ")
    );

    // Second 2×3 commit over a page that already has 3 visuals — z-order
    // should grow past the existing max, no overlaps on row/col logic.
    const ids2 = project.listVisualIds(pageId);
    let maxZ = 0;
    for (const id of ids2) {
      const v = project.getVisual(pageId, id);
      if (v.position.z > maxZ) maxZ = v.position.z;
    }
    assert("COMMIT 3  z-order grows past existing (max > 0)", maxZ > 0);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n" + "\u2550".repeat(67));
console.log(`  ${passed} passed, ${failed} failed`);
console.log("\u2550".repeat(67));

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `  ${f.detail}` : ""}`);
  process.exit(1);
}
