// ═══════════════════════════════════════════════════════════════════════════════
// Wireframe Validator — Test Runner
//
// Runs the validator against:
//   1. The 3 canonical sample layouts from docs/wireframes.md (should PASS)
//   2. Five deliberately-broken layouts that demonstrate the common causes of
//      misalignment the validator is supposed to catch.
//
// Run:  node scripts/test-wireframe-validator.js
// ═══════════════════════════════════════════════════════════════════════════════

const { validateWireframe, formatReport, CANVAS } = require("../dist/wireframe-validator.js");

// --- helpers ---------------------------------------------------------------

const banner = { id: "Banner", visualType: "shape", x: 0, y: 0, width: 1280, height: 52 };

function run(name, visuals, expectOk) {
  const report = validateWireframe(visuals);
  const pass = report.ok === expectOk;
  const icon = pass ? "✓" : "✗";
  console.log(`\n${"═".repeat(79)}`);
  console.log(`${icon} ${name}   (expected ${expectOk ? "PASS" : "FAIL"}, got ${report.ok ? "PASS" : "FAIL"})`);
  console.log("═".repeat(79));
  console.log(formatReport(report));
  return pass;
}

// Variant that asserts a specific issue code is present in the report.
// Used for warning-level checks (e.g. COLUMN_MISALIGN) where report.ok
// would still be true but we want to verify the warning fired.
function runExpectCode(name, visuals, expectedCode) {
  const report = validateWireframe(visuals);
  const hit = report.issues.some((i) => i.code === expectedCode);
  const icon = hit ? "✓" : "✗";
  console.log(`\n${"═".repeat(79)}`);
  console.log(`${icon} ${name}   (expected issue code ${expectedCode}, got ${hit ? "present" : "MISSING"})`);
  console.log("═".repeat(79));
  console.log(formatReport(report));
  return hit;
}

// --- positive cases --------------------------------------------------------

// Layout A — Dashboard: 5 cards, 2 charts, 3 details (11 visuals)
//   5 cards:  (1250 - 4×5) / 5 = 246
//   2 charts: (1250 - 5)    / 2 = 622.5 → 622 + 623
//   3 detail: (1250 - 2×5)  / 3 = 413.33 → 413 + 413 + 414
const layoutA = [
  banner,
  { id: "Card 1",       visualType: "card", x: 15,   y: 57,  width: 246, height: 90  },
  { id: "Card 2",       visualType: "card", x: 266,  y: 57,  width: 246, height: 90  },
  { id: "Card 3",       visualType: "card", x: 517,  y: 57,  width: 246, height: 90  },
  { id: "Card 4",       visualType: "card", x: 768,  y: 57,  width: 246, height: 90  },
  { id: "Slicer",       visualType: "slicer", x: 1019, y: 57, width: 246, height: 90 },
  { id: "Chart Left",   visualType: "barChart", x: 15,  y: 152, width: 622, height: 280 },
  { id: "Chart Right",  visualType: "lineChart", x: 642, y: 152, width: 623, height: 280 },
  { id: "Detail 1",     visualType: "tableEx", x: 15,  y: 437, width: 413, height: 277 },
  { id: "Detail 2",     visualType: "tableEx", x: 433, y: 437, width: 413, height: 277 },
  { id: "Detail 3",     visualType: "tableEx", x: 851, y: 437, width: 414, height: 277 },
];

// Layout B — Analysis: 3 slicers, main chart + 4 KPI sidebar, full-width table (10 visuals)
//   3 slicers: 413 / 413 / 414  at x=15 / 433 / 851
//   2/3 + 1/3 split: 830 + 415 (= 1245, +5 gap = 1250 usable)
const layoutB = [
  banner,
  { id: "Slicer 1",    visualType: "slicer",   x: 15,  y: 57,  width: 413, height: 40  },
  { id: "Slicer 2",    visualType: "slicer",   x: 433, y: 57,  width: 413, height: 40  },
  { id: "Slicer 3",    visualType: "slicer",   x: 851, y: 57,  width: 414, height: 40  },
  { id: "Main Chart",  visualType: "comboChart", x: 15,  y: 102, width: 830, height: 380 },
  { id: "KPI 1",       visualType: "card",     x: 850, y: 102, width: 415, height: 93  },
  { id: "KPI 2",       visualType: "card",     x: 850, y: 200, width: 415, height: 93  },
  { id: "KPI 3",       visualType: "card",     x: 850, y: 298, width: 415, height: 93  },
  { id: "KPI 4",       visualType: "card",     x: 850, y: 396, width: 415, height: 86  },
  { id: "Table",       visualType: "tableEx",  x: 15,  y: 487, width: 1250, height: 227 },
];

// Layout D — Sidebar Nav: 160px left rail + 4 KPIs + 2 charts + detail table
//   Nav rail at x=15 w=160 → right=175
//   Content area x=180, width 1085 = 1280-180-15
//   KPI row:  (1085 - 3*5) / 4 = 267.5 → 267 / 268 / 267 / 268
//   Chart row: (1085 - 5) / 2 = 540
const layoutD = [
  banner,
  { id: "Nav Rail",    visualType: "slicer",    x: 15,  y: 57,  width: 160, height: 657 },
  { id: "KPI 1",       visualType: "card",      x: 180, y: 57,  width: 267, height: 90  },
  { id: "KPI 2",       visualType: "card",      x: 452, y: 57,  width: 268, height: 90  },
  { id: "KPI 3",       visualType: "card",      x: 725, y: 57,  width: 267, height: 90  },
  { id: "KPI 4",       visualType: "card",      x: 997, y: 57,  width: 268, height: 90  },
  { id: "Chart Left",  visualType: "barChart",  x: 180, y: 152, width: 540, height: 280 },
  { id: "Chart Right", visualType: "lineChart", x: 725, y: 152, width: 540, height: 280 },
  { id: "Detail",      visualType: "tableEx",   x: 180, y: 437, width: 1085, height: 277 },
];

// Layout E — 3×3 Tile Grid: 9 tiles uniform, no hierarchy
//   3 cols: 413/413/414 (x=15, 433, 851), 3 rows @ 215
//   Row y: 57, 277, 497 → bottom 497+215 = 712 (≤ 714)
const layoutE = [
  banner,
  { id: "Tile 1", visualType: "card", x: 15,  y: 57,  width: 413, height: 215 },
  { id: "Tile 2", visualType: "card", x: 433, y: 57,  width: 413, height: 215 },
  { id: "Tile 3", visualType: "card", x: 851, y: 57,  width: 414, height: 215 },
  { id: "Tile 4", visualType: "card", x: 15,  y: 277, width: 413, height: 215 },
  { id: "Tile 5", visualType: "card", x: 433, y: 277, width: 413, height: 215 },
  { id: "Tile 6", visualType: "card", x: 851, y: 277, width: 414, height: 215 },
  { id: "Tile 7", visualType: "card", x: 15,  y: 497, width: 413, height: 215 },
  { id: "Tile 8", visualType: "card", x: 433, y: 497, width: 413, height: 215 },
  { id: "Tile 9", visualType: "card", x: 851, y: 497, width: 414, height: 215 },
];

// Layout C — KPI Summary: 6 cards in 2 rows + full-width chart (8 visuals)
//   3 cols: 413/413/414, full chart 1250
const layoutC = [
  banner,
  { id: "Card 1", visualType: "card", x: 15,  y: 57,  width: 413, height: 120 },
  { id: "Card 2", visualType: "card", x: 433, y: 57,  width: 413, height: 120 },
  { id: "Card 3", visualType: "card", x: 851, y: 57,  width: 414, height: 120 },
  { id: "Card 4", visualType: "card", x: 15,  y: 182, width: 413, height: 120 },
  { id: "Card 5", visualType: "card", x: 433, y: 182, width: 413, height: 120 },
  { id: "Card 6", visualType: "card", x: 851, y: 182, width: 414, height: 120 },
  { id: "Chart",  visualType: "barChart", x: 15, y: 307, width: 1250, height: 407 },
];

// --- negative cases (demonstrate misalignment root causes) -----------------

// BAD 1 — Rounding overflow: 5 cards of 247 (right edge 1270 > 1265)
// Root cause: LLM rounded (1250/5)=250 and forgot to subtract for gaps.
const badRounding = [
  banner,
  { id: "Card 1", visualType: "card", x: 15,   y: 57, width: 247, height: 90 },
  { id: "Card 2", visualType: "card", x: 267,  y: 57, width: 247, height: 90 },
  { id: "Card 3", visualType: "card", x: 519,  y: 57, width: 247, height: 90 },
  { id: "Card 4", visualType: "card", x: 771,  y: 57, width: 247, height: 90 },
  { id: "Card 5", visualType: "card", x: 1023, y: 57, width: 247, height: 90 },
];

// BAD 2 — Wrong gap: 10px horizontal gap instead of 5px
const badGap = [
  banner,
  { id: "Chart Left",  visualType: "barChart",  x: 15,  y: 57, width: 617, height: 280 },
  { id: "Chart Right", visualType: "lineChart", x: 642, y: 57, width: 617, height: 280 },
  //                                                  ↑ 642 − (15+617) = 10px gap (bad)
];

// BAD 3 — Missing left margin: non-banner visual at x=0
const badMargin = [
  banner,
  { id: "Full Chart", visualType: "barChart", x: 0, y: 57, width: 1280, height: 300 },
];

// BAD 4 — Overlapping visuals: two cards both at (15, 57, 500, 90)
const badOverlap = [
  banner,
  { id: "Card A", visualType: "card", x: 15,  y: 57, width: 500, height: 90 },
  { id: "Card B", visualType: "card", x: 200, y: 57, width: 500, height: 90 }, // overlaps Card A
];

// BAD 5 — Silent default: visual at (0,0) that is NOT a banner (common LLM bug: forgot x/y)
const badSilentDefault = [
  banner,
  { id: "Chart",  visualType: "barChart", x: 0, y: 0,   width: 400, height: 200 }, // no x/y set
  { id: "Table",  visualType: "tableEx",  x: 15, y: 300, width: 1250, height: 200 },
];

// BAD 6 — Bottom overflow: last row extends past y=720
const badBottomOverflow = [
  banner,
  { id: "Chart",  visualType: "barChart", x: 15, y: 57, width: 1250, height: 400 },
  { id: "Table",  visualType: "tableEx",  x: 15, y: 462, width: 1250, height: 300 }, // bottom=762 > 720
];

// BAD 7 — Bottom margin violation: visual lands inside canvas but crosses
// the 6px bottom margin (bottom=718 > 714). This is the failure mode we
// added in v0.5.4 — the page previously allowed bottom=720, now it must be ≤ 714.
const badBottomMargin = [
  banner,
  { id: "Chart",  visualType: "barChart", x: 15, y: 57,  width: 1250, height: 380 },
  { id: "Table",  visualType: "tableEx",  x: 15, y: 442, width: 1250, height: 276 }, // bottom=718 > 714
];

// BAD 8 — Column drift between same-count adjacent rows.
// Two rows of 3 visuals each. Row 1 uses columns 15 / 434 / 852 (widths 414).
// Row 2 uses 18 / 434 / 852 — the first column drifts by 3px, which passes
// every hard rule (margins ok, gaps ok, no overlap) but looks misaligned.
// The validator should emit a COLUMN_MISALIGN warning (severity: warning,
// so report.ok stays true — we assert the code, not ok).
const badColumnDrift = [
  banner,
  { id: "Row1 Col1", visualType: "card", x: 15,  y: 57,  width: 414, height: 120 },
  { id: "Row1 Col2", visualType: "card", x: 434, y: 57,  width: 413, height: 120 },
  { id: "Row1 Col3", visualType: "card", x: 852, y: 57,  width: 413, height: 120 },
  { id: "Row2 Col1", visualType: "card", x: 18,  y: 182, width: 411, height: 120 }, // x drifted +3, w -3
  { id: "Row2 Col2", visualType: "card", x: 434, y: 182, width: 413, height: 120 },
  { id: "Row2 Col3", visualType: "card", x: 852, y: 182, width: 413, height: 120 },
];

// --- run ------------------------------------------------------------------

console.log("Power BI Report Wireframe Validator — Test Suite");
console.log(`Canvas: ${CANVAS.width}×${CANVAS.height}, margins ${CANVAS.marginLeft}/${CANVAS.marginRight}, gap ${CANVAS.gap}, banner h=${CANVAS.bannerHeight}`);

const results = [];
results.push(run("Layout A — Dashboard (5 cards, 2 charts, 3 details)", layoutA, true));
results.push(run("Layout B — Analysis (slicers, chart + KPI sidebar, table)", layoutB, true));
results.push(run("Layout C — KPI Summary (6 cards, wide chart)", layoutC, true));
results.push(run("Layout D — Sidebar Nav (160 rail + 4 KPI + 2 charts + table)", layoutD, true));
results.push(run("Layout E — 3×3 Tile Grid (9 equal tiles)", layoutE, true));

results.push(run("BAD 1 — Rounding overflow (245×5 cards)", badRounding, false));
results.push(run("BAD 2 — Wrong 10px gap between charts", badGap, false));
results.push(run("BAD 3 — Missing left margin (x=0, non-banner)", badMargin, false));
results.push(run("BAD 4 — Overlapping cards", badOverlap, false));
results.push(run("BAD 5 — Silent default (0,0) for non-banner", badSilentDefault, false));
results.push(run("BAD 6 — Bottom edge overflow (762 > 720)", badBottomOverflow, false));
results.push(run("BAD 7 — Bottom margin violation (718 > 714)", badBottomMargin, false));
results.push(runExpectCode("BAD 8 — Column drift between same-count rows (warning)", badColumnDrift, "COLUMN_MISALIGN"));

const passed = results.filter(Boolean).length;
const total = results.length;
console.log(`\n${"═".repeat(79)}`);
console.log(`Suite result: ${passed}/${total} tests matched expectation`);
console.log("═".repeat(79));
process.exit(passed === total ? 0 : 1);
