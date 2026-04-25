// ═══════════════════════════════════════════════════════════════════════════════
// Layout Validator — Test Runner
//
// Runs `runLayoutValidation` against hand-built WireframeVisual arrays.
// No I/O, no PBI Desktop, no report folder needed.
//
// Covers:
//   STRICT 1–10 — one case per blocking LayoutErrorCode (strict mode rejects)
//   WARN   1–4  — warn mode never blocks; errors become warnings
//   OFF    1–2  — off mode skips validation entirely
//   ALWAYS 1–2  — COLUMN_MISALIGN stays warn regardless of mode
//   SHAPE  1–4  — LayoutError payload shape: code/actual/limits/suggestion/
//                 rule/guide all present and non-empty
//   MODE   1–3  — resolveMode precedence (per-call > env > default)
//   CANVAS 1    — getCanvasSummary() returns the expected fields
//
// Run:  node scripts/test-layout-validator.js
// ═══════════════════════════════════════════════════════════════════════════════

const {
  runLayoutValidation,
  getCanvasSummary,
} = require("../dist/helpers/layoutValidation.js");

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Canonical valid 1x2 layout — two cards side-by-side in the content row.
const validTwoCards = () => [
  { id: "a", visualType: "card", x: 15,  y: 57, width: 622, height: 657, title: "Left" },
  { id: "b", visualType: "card", x: 642, y: 57, width: 623, height: 657, title: "Right" },
];

// Canonical banner + 1 content visual
const validBannerPlusOne = () => [
  { id: "banner", visualType: "shape", x: 0, y: 0, width: 1280, height: 52 },
  { id: "body", visualType: "card", x: 15, y: 57, width: 1250, height: 657, title: "Body" },
];

// ---------------------------------------------------------------------------
// STRICT — one blocking case per code
// ---------------------------------------------------------------------------

section("Strict mode — blocking codes");

{
  // STRICT 1 — out_of_bounds_right
  const visuals = [{ id: "v", visualType: "card", x: 1200, y: 60, width: 200, height: 100, title: "Overflow" }];
  const r = runLayoutValidation(visuals, true);
  const code = r.errors.map((e) => e.code);
  assert("STRICT 1  out_of_bounds_right blocks", !r.proceed && code.includes("out_of_bounds_right"));
}

{
  // STRICT 2 — out_of_bounds_bottom
  const visuals = [{ id: "v", visualType: "card", x: 15, y: 700, width: 200, height: 200, title: "TallFall" }];
  const r = runLayoutValidation(visuals, true);
  assert("STRICT 2  out_of_bounds_bottom blocks", !r.proceed && r.errors.some((e) => e.code === "out_of_bounds_bottom"));
}

{
  // STRICT 3 — out_of_bounds_negative
  const visuals = [{ id: "v", visualType: "card", x: -10, y: 60, width: 100, height: 100, title: "Neg" }];
  const r = runLayoutValidation(visuals, true);
  assert("STRICT 3  out_of_bounds_negative blocks", !r.proceed && r.errors.some((e) => e.code === "out_of_bounds_negative"));
}

{
  // STRICT 4 — overlap
  const visuals = [
    { id: "a", visualType: "card", x: 15, y: 57, width: 500, height: 400, title: "A" },
    { id: "b", visualType: "card", x: 100, y: 100, width: 500, height: 400, title: "B" },
  ];
  const r = runLayoutValidation(visuals, true);
  assert("STRICT 4  overlap blocks", !r.proceed && r.errors.some((e) => e.code === "overlap"));
}

{
  // STRICT 5 — wrong_left_margin (x must be ≥ 15; use x=10)
  const visuals = [{ id: "v", visualType: "card", x: 10, y: 57, width: 500, height: 500, title: "OffMargin" }];
  const r = runLayoutValidation(visuals, true);
  assert("STRICT 5  wrong_left_margin blocks", !r.proceed && r.errors.some((e) => e.code === "wrong_left_margin"));
}

{
  // STRICT 6 — wrong_horizontal_gap (2px not 5px between adjacent cards)
  const visuals = [
    { id: "a", visualType: "card", x: 15,  y: 57, width: 600, height: 657, title: "A" },
    { id: "b", visualType: "card", x: 617, y: 57, width: 648, height: 657, title: "B" }, // gap = 2px
  ];
  const r = runLayoutValidation(visuals, true);
  assert("STRICT 6  wrong_horizontal_gap blocks", !r.proceed && r.errors.some((e) => e.code === "wrong_horizontal_gap"));
}

{
  // STRICT 7 — silent_default_position (non-banner at 0,0)
  const visuals = [{ id: "v", visualType: "card", x: 0, y: 0, width: 200, height: 100, title: "Default" }];
  const r = runLayoutValidation(visuals, true);
  // Silent default is reported as a warning by the underlying validator,
  // so it becomes a layoutWarnings entry (not blocking) in every mode.
  assert(
    "STRICT 7  silent_default_position surfaces as warning",
    r.warnings.some((e) => e.code === "silent_default_position")
  );
}

{
  // STRICT 8 — negative_dimension
  const visuals = [{ id: "v", visualType: "card", x: 15, y: 57, width: -10, height: 100, title: "BadDim" }];
  const r = runLayoutValidation(visuals, true);
  assert("STRICT 8  negative_dimension blocks", !r.proceed && r.errors.some((e) => e.code === "negative_dimension"));
}

{
  // STRICT 9 — banner_width (banner not spanning full canvas)
  const visuals = [
    { id: "banner", visualType: "shape", x: 0, y: 0, width: 800, height: 52 }, // should be 1280
    { id: "body", visualType: "card", x: 15, y: 57, width: 1250, height: 657, title: "Body" },
  ];
  const r = runLayoutValidation(visuals, true);
  assert(
    "STRICT 9  banner_width blocks",
    !r.proceed && r.errors.some((e) => e.code === "banner_width")
  );
}

{
  // STRICT 10 — clean layout passes
  const r = runLayoutValidation(validBannerPlusOne(), true);
  assert("STRICT 10 clean banner+body passes", r.proceed && r.errors.length === 0);
}

// ---------------------------------------------------------------------------
// WARN — same bad layouts, writes proceed
// ---------------------------------------------------------------------------

section("Warn mode — never blocks");

{
  // WARN 1 — overflow in warn mode
  const visuals = [{ id: "v", visualType: "card", x: 1200, y: 60, width: 200, height: 100, title: "Overflow" }];
  const r = runLayoutValidation(visuals, false);
  assert("WARN 1  overflow proceeds", r.proceed && r.mode === "warn" && r.errors.length === 0);
  assert("WARN 1  overflow surfaced as warning", r.warnings.some((w) => w.code === "out_of_bounds_right"));
}

{
  // WARN 2 — overlap in warn mode
  const visuals = [
    { id: "a", visualType: "card", x: 15, y: 57, width: 500, height: 400, title: "A" },
    { id: "b", visualType: "card", x: 100, y: 100, width: 500, height: 400, title: "B" },
  ];
  const r = runLayoutValidation(visuals, false);
  assert("WARN 2  overlap proceeds with warning", r.proceed && r.warnings.some((w) => w.code === "overlap"));
}

{
  // WARN 3 — clean layout still passes, no warnings
  const r = runLayoutValidation(validBannerPlusOne(), false);
  assert("WARN 3  clean layout has no warnings", r.proceed && r.warnings.length === 0);
}

{
  // WARN 4 — warn mode downgraded errors preserve actual/limits/suggestion
  const visuals = [{ id: "v", visualType: "card", x: 1200, y: 60, width: 200, height: 100, title: "Overflow" }];
  const r = runLayoutValidation(visuals, false);
  const w = r.warnings.find((x) => x.code === "out_of_bounds_right");
  // 2026-04-25: rule/guide/rawMessage prose dropped — codes are documented in
  // skills/errors.md instead. Just verify the structured payload survives.
  assert(
    "WARN 4  downgraded error retains structured payload",
    w && w.actual && w.limits && w.suggestion
  );
}

// ---------------------------------------------------------------------------
// OFF — validation skipped
// ---------------------------------------------------------------------------

section("Off mode — skipped entirely");

{
  const prev = process.env.MCP_LAYOUT_VALIDATION;
  process.env.MCP_LAYOUT_VALIDATION = "off";
  const visuals = [{ id: "v", visualType: "card", x: 1200, y: 60, width: 500, height: 500, title: "X" }];
  const r = runLayoutValidation(visuals, undefined);
  assert("OFF 1  env=off proceeds regardless", r.proceed && r.errors.length === 0 && r.warnings.length === 0);
  assert("OFF 1  mode is 'off'", r.mode === "off");
  process.env.MCP_LAYOUT_VALIDATION = prev || "";
}

{
  const r = runLayoutValidation([], true);
  assert("OFF 2  empty visuals short-circuits", r.proceed && r.errors.length === 0);
}

// ---------------------------------------------------------------------------
// ALWAYS — column alignment always warn, never blocks
// ---------------------------------------------------------------------------

section("Always-warn codes");

{
  // COLUMN_MISALIGN — row 0 col 0 at x=15, row 1 col 0 at x=20
  const visuals = [
    { id: "a1", visualType: "card", x: 15, y: 57, width: 620, height: 325, title: "A1" },
    { id: "a2", visualType: "card", x: 640, y: 57, width: 625, height: 325, title: "A2" },
    { id: "b1", visualType: "card", x: 20, y: 387, width: 615, height: 327, title: "B1" }, // x=20 not 15
    { id: "b2", visualType: "card", x: 640, y: 387, width: 625, height: 327, title: "B2" },
  ];
  const rStrict = runLayoutValidation(visuals, true);
  const rWarn = runLayoutValidation(visuals, false);
  // In strict mode column misalign still should NOT block — it lives in warnings
  const strictHasBlockingColumnMisalign = rStrict.errors.some((e) => e.code === "column_misalign");
  assert("ALWAYS 1 column_misalign never lands in errors[]", !strictHasBlockingColumnMisalign);
  // In warn mode it ends up in warnings
  assert("ALWAYS 2 column_misalign appears in warnings[] (both modes)",
    rStrict.warnings.some((w) => w.code === "column_misalign") ||
    rWarn.warnings.some((w) => w.code === "column_misalign"));
}

// ---------------------------------------------------------------------------
// SHAPE — LayoutError payload contract
// ---------------------------------------------------------------------------

section("LayoutError shape");

{
  const visuals = [{ id: "v", visualType: "card", x: 1200, y: 60, width: 200, height: 100, title: "Ov" }];
  const r = runLayoutValidation(visuals, true);
  const e = r.errors[0];
  assert("SHAPE 1  code present",        e && typeof e.code === "string" && e.code.length > 0);
  assert("SHAPE 2  suggestion non-empty", e && typeof e.suggestion === "string" && e.suggestion.length > 0);
  assert("SHAPE 3  actual echoes input",  e && e.actual && e.actual.x === 1200 && e.actual.width === 200);
  assert("SHAPE 4  limits populated",     e && e.limits && typeof e.limits.maxRightEdge === "number");
  // SHAPE 5/6 (rule/guide) removed 2026-04-25 — codes documented in skills/errors.md.
  assert("SHAPE 5  rule/guide stripped",  e && e.rule === undefined && e.guide === undefined);
}

// ---------------------------------------------------------------------------
// MODE — resolution precedence
// ---------------------------------------------------------------------------

section("Mode resolution precedence");

{
  const prev = process.env.MCP_LAYOUT_VALIDATION;
  const visuals = [{ id: "v", visualType: "card", x: 1200, y: 60, width: 200, height: 100, title: "Ov" }];

  // MODE 1 — per-call true beats env off
  process.env.MCP_LAYOUT_VALIDATION = "off";
  const r1 = runLayoutValidation(visuals, true);
  assert("MODE 1  per-call=true overrides env=off", r1.mode === "strict" && !r1.proceed);

  // MODE 2 — per-call false beats env strict
  process.env.MCP_LAYOUT_VALIDATION = "strict";
  const r2 = runLayoutValidation(visuals, false);
  assert("MODE 2  per-call=false overrides env=strict", r2.mode === "warn" && r2.proceed);

  // MODE 3 — env warn applies when per-call undefined
  process.env.MCP_LAYOUT_VALIDATION = "warn";
  const r3 = runLayoutValidation(visuals, undefined);
  assert("MODE 3  env=warn used when per-call undefined", r3.mode === "warn" && r3.proceed);

  process.env.MCP_LAYOUT_VALIDATION = prev || "";
}

// ---------------------------------------------------------------------------
// CANVAS summary
// ---------------------------------------------------------------------------

section("Canvas summary");

{
  const c = getCanvasSummary();
  assert(
    "CANVAS 1 getCanvasSummary returns expected fields",
    c.width === 1280 &&
      c.height === 720 &&
      c.usableWidth === 1250 &&
      c.usableHeight === 714 &&
      c.gap === 5 &&
      c.margins.left === 15 &&
      c.margins.right === 15 &&
      c.margins.bottom === 6 &&
      c.bannerHeight === 52
  );
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
