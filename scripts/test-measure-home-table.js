// ═══════════════════════════════════════════════════════════════════════════════
// Measure Home-Table Regression Test
//
// The bug: when an LLM passes `Sales[Total Revenue]` for a measure that is
// actually authored on `_Measures`, the visual ended up with the right field
// name but the wrong SourceRef.Entity, and PBI Desktop silently rendered no
// data. This suite locks in the two halves of the fix:
//
//   1. validateFieldSpec surfaces the correct home table as a top suggestion
//      when a measure isn't found in the specified entity but lives elsewhere.
//   2. parseFieldSpec auto-corrects the entity when an inventory is supplied
//      and exactly one other table defines the measure. Columns and
//      aggregations are NEVER auto-corrected. Without an inventory, behaviour
//      is unchanged (legacy/live-connect compat).
//
// Run:  node scripts/test-measure-home-table.js
// ═══════════════════════════════════════════════════════════════════════════════

const { validateFieldSpec } = require("../dist/helpers/bindingValidation.js");
const {
  parseFieldSpec,
  beginBindingAutoCorrections,
  drainBindingAutoCorrections,
} = require("../dist/helpers/createVisual.js");

// ---------------------------------------------------------------------------
// Synthetic inventory mirroring getModelFieldInventory's shape:
//   - Sales        : columns only (no measures)
//   - _Measures    : single home for "Total Revenue"
//   - Inventory    : single home for "Stock Count"
//   - HomesA, HomesB : both define "Ambiguous Measure" (no auto-correct)
// ---------------------------------------------------------------------------

const inventory = {
  tables: new Map([
    ["Sales",     { columns: new Set(["Amount", "Quantity"]),    measures: new Set() }],
    ["_Measures", { columns: new Set(),                          measures: new Set(["Total Revenue"]) }],
    ["Inventory", { columns: new Set(),                          measures: new Set(["Stock Count"]) }],
    ["HomesA",    { columns: new Set(),                          measures: new Set(["Ambiguous Measure"]) }],
    ["HomesB",    { columns: new Set(),                          measures: new Set(["Ambiguous Measure"]) }],
  ]),
  tableNames: ["Sales", "_Measures", "Inventory", "HomesA", "HomesB"],
  extensionMeasures: new Map(),
  builtAt: Date.now(),
};

let passed = 0;
let failed = 0;
function pass(n) { console.log(`  ✓ ${n}`); passed++; }
function fail(n, d) { console.log(`  ✗ ${n}`); if (d) console.log(`      ${d}`); failed++; }

// ---------------------------------------------------------------------------
// Validator suggestions
// ---------------------------------------------------------------------------

console.log("\n─── Validator: home-table suggestion ───────────────────────────────");

(function () {
  const err = validateFieldSpec(
    { field: "Sales[Total Revenue]", type: "measure" },
    inventory
  );
  if (!err) return fail("VAL 1  Sales[Total Revenue] measure → measure_not_found", "expected error");
  if (err.reason !== "measure_not_found") {
    return fail("VAL 1  reason=measure_not_found", `got ${err.reason}`);
  }
  if (err.suggestions[0] !== "_Measures[Total Revenue] (actual home table)") {
    return fail(
      "VAL 1  suggestions[0] points at home table",
      `got "${err.suggestions[0]}"`
    );
  }
  pass("VAL 1  Sales[Total Revenue] → suggests _Measures[Total Revenue] (actual home table)");
})();

(function () {
  const err = validateFieldSpec(
    { field: "Sales[Ambiguous Measure]", type: "measure" },
    inventory
  );
  if (!err) return fail("VAL 2  ambiguous measure → measure_not_found", "expected error");
  const tagged = err.suggestions.filter((s) => s.includes("(candidate home table)"));
  if (tagged.length < 2) {
    return fail(
      "VAL 2  suggestions list both candidates",
      `got ${JSON.stringify(err.suggestions)}`
    );
  }
  pass("VAL 2  ambiguous measure → both HomesA and HomesB listed as candidates");
})();

// ---------------------------------------------------------------------------
// parseFieldSpec auto-correction
// ---------------------------------------------------------------------------

console.log("\n─── parseFieldSpec: auto-correction ────────────────────────────────");

(function () {
  beginBindingAutoCorrections();
  const ref = parseFieldSpec(
    { field: "Sales[Total Revenue]", type: "measure" },
    inventory
  );
  const corrections = drainBindingAutoCorrections();
  const entity = ref?.Measure?.Expression?.SourceRef?.Entity;
  const property = ref?.Measure?.Property;
  if (entity !== "_Measures" || property !== "Total Revenue") {
    return fail(
      "PAR 1  measure auto-corrects to home table",
      `got Entity=${entity} Property=${property}`
    );
  }
  if (corrections.length !== 1
      || corrections[0].from !== "Sales[Total Revenue]"
      || corrections[0].to !== "_Measures[Total Revenue]"
      || corrections[0].reason !== "measure home table") {
    return fail(
      "PAR 1  bindingAutoCorrections records the rewrite",
      JSON.stringify(corrections)
    );
  }
  pass("PAR 1  Sales[Total Revenue] → _Measures (auto-corrected, surfaced)");
})();

(function () {
  beginBindingAutoCorrections();
  const ref = parseFieldSpec(
    { field: "_Measures[Total Revenue]", type: "measure" },
    inventory
  );
  const corrections = drainBindingAutoCorrections();
  const entity = ref?.Measure?.Expression?.SourceRef?.Entity;
  if (entity !== "_Measures") {
    return fail("PAR 2  already-correct measure unchanged", `got Entity=${entity}`);
  }
  if (corrections.length !== 0) {
    return fail("PAR 2  no correction emitted", JSON.stringify(corrections));
  }
  pass("PAR 2  _Measures[Total Revenue] → unchanged, no correction");
})();

(function () {
  beginBindingAutoCorrections();
  const ref = parseFieldSpec(
    { field: "Sales[Amount]", type: "column" },
    inventory
  );
  const corrections = drainBindingAutoCorrections();
  const entity = ref?.Column?.Expression?.SourceRef?.Entity;
  if (entity !== "Sales") {
    return fail("PAR 3  column never auto-corrects", `got Entity=${entity}`);
  }
  if (corrections.length !== 0) {
    return fail("PAR 3  no correction emitted for column", JSON.stringify(corrections));
  }
  pass("PAR 3  Sales[Amount] column → unchanged, no correction");
})();

(function () {
  // No inventory passed → no correction even when the measure is in the wrong table.
  beginBindingAutoCorrections();
  const ref = parseFieldSpec(
    { field: "Sales[Total Revenue]", type: "measure" }
    // intentional: no inventory arg
  );
  const corrections = drainBindingAutoCorrections();
  const entity = ref?.Measure?.Expression?.SourceRef?.Entity;
  if (entity !== "Sales") {
    return fail("PAR 4  no inventory → no correction", `got Entity=${entity}`);
  }
  if (corrections.length !== 0) {
    return fail("PAR 4  no correction recorded", JSON.stringify(corrections));
  }
  pass("PAR 4  no inventory → legacy behaviour, no correction");
})();

(function () {
  // Ambiguous (>1 home table) → no auto-correct (validator surfaces candidates instead)
  beginBindingAutoCorrections();
  const ref = parseFieldSpec(
    { field: "Sales[Ambiguous Measure]", type: "measure" },
    inventory
  );
  const corrections = drainBindingAutoCorrections();
  const entity = ref?.Measure?.Expression?.SourceRef?.Entity;
  if (entity !== "Sales") {
    return fail(
      "PAR 5  ambiguous measure NOT auto-corrected",
      `got Entity=${entity} (should stay Sales when ambiguous)`
    );
  }
  if (corrections.length !== 0) {
    return fail("PAR 5  no correction recorded for ambiguous", JSON.stringify(corrections));
  }
  pass("PAR 5  ambiguous measure → not auto-corrected (validator handles disambiguation)");
})();

// ---------------------------------------------------------------------------
// Sort-path regression (v0.9.4) — pbir_set_visual_sort uses parseFieldSpec
// with inventory, so the same auto-correction surfaces on sort targets.
// We exercise the exact code path the refactored handler runs: a parseFieldSpec
// call per sort entry, with the auto-correction sink draining at the end.
// ---------------------------------------------------------------------------

console.log("\n─── Sort path: same auto-correction applies (v0.9.4) ───────────────");

(function () {
  // Sort the same way pbir_set_visual_sort does — measure on the wrong table.
  const sortInput = [
    { field: "Sales[Total Revenue]", type: "measure", direction: "Descending" },
  ];
  beginBindingAutoCorrections();
  const sortEntries = sortInput.map((s) =>
    ({ field: parseFieldSpec({ field: s.field, type: s.type }, inventory), direction: s.direction })
  );
  const corrections = drainBindingAutoCorrections();

  const entity = sortEntries[0]?.field?.Measure?.Expression?.SourceRef?.Entity;
  if (entity !== "_Measures") {
    return fail("SORT 1  sort-target measure auto-corrects to home table",
      `got Entity=${entity}`);
  }
  if (corrections.length !== 1
      || corrections[0].from !== "Sales[Total Revenue]"
      || corrections[0].to !== "_Measures[Total Revenue]") {
    return fail("SORT 1  bindingAutoCorrections emitted for sort target",
      JSON.stringify(corrections));
  }
  pass("SORT 1  pbir_set_visual_sort path — measure on wrong table auto-corrected + surfaced");
})();

(function () {
  // Explicit-correct path: no correction emitted.
  const sortInput = [
    { field: "_Measures[Total Revenue]", type: "measure", direction: "Descending" },
  ];
  beginBindingAutoCorrections();
  sortInput.map((s) =>
    parseFieldSpec({ field: s.field, type: s.type }, inventory)
  );
  const corrections = drainBindingAutoCorrections();
  if (corrections.length !== 0) {
    return fail("SORT 2  explicit-correct sort target → no correction",
      JSON.stringify(corrections));
  }
  pass("SORT 2  pbir_set_visual_sort path — explicit-correct entity emits no correction");
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
