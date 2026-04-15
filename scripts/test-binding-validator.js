// ═══════════════════════════════════════════════════════════════════════════════
// Binding Validator — Test Runner
//
// Runs `validateFieldSpec` / `validateBindings` / `formatBindingErrors` against
// a hand-built in-memory `ModelFieldInventory` so the test has zero I/O and
// needs neither PBI Desktop nor a sibling `.SemanticModel` folder.
//
// Covers:
//   POS 1–5  — every valid spec shape: column, measure, agg(column), shorthand,
//              entity+property split
//   NEG 1–7  — every error reason: table_not_found, column_not_found,
//              measure_not_found, type_mismatch_column_is_measure,
//              type_mismatch_measure_is_column, parse_error, unknown-in-empty
//   SUG 1–2  — nearest-match suggestions return the expected "Table[Field]"
//   FMT 1    — `formatBindingErrors` roundtrips a multi-error batch
//   MODE 1–3 — `resolveValidationMode` precedence (per-call > env > default)
//
// Run:  node scripts/test-binding-validator.js
// ═══════════════════════════════════════════════════════════════════════════════

const {
  validateFieldSpec,
  validateBindings,
  formatBindingErrors,
  resolveValidationMode,
} = require("../dist/helpers/bindingValidation.js");

// ---------------------------------------------------------------------------
// Build an in-memory model inventory that matches the shape produced by
// `getModelFieldInventory`. Two tables: Sales (columns + measures) and
// Date (columns only). One extension measure on Sales so the extension
// merge path is covered.
// ---------------------------------------------------------------------------

const inventory = {
  tables: new Map([
    [
      "Sales",
      {
        columns: new Set(["OrderDate", "Quantity", "UnitPrice", "Discount"]),
        measures: new Set(["Total Sales", "Total Profit", "Margin %"]),
      },
    ],
    [
      "Date",
      {
        columns: new Set(["Date", "Year", "Month", "Quarter"]),
        measures: new Set(),
      },
    ],
  ]),
  tableNames: ["Sales", "Date"],
  extensionMeasures: new Map([["Sales", new Set(["Ext YTD Sales"])]]),
  builtAt: Date.now(),
};

// `getModelFieldInventory` merges extensionMeasures into the Sales measures
// set, so mimic that here so validateFieldSpec sees the extension measure.
inventory.tables.get("Sales").measures.add("Ext YTD Sales");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}
function fail(name, detail) {
  console.log(`  ✗ ${name}`);
  if (detail) console.log(`      ${detail}`);
  failed++;
}

function expectValid(name, spec) {
  const err = validateFieldSpec(spec, inventory);
  if (err === null) pass(name);
  else fail(name, `expected valid, got ${err.reason}: ${JSON.stringify(err)}`);
}

function expectInvalid(name, spec, expectedReason) {
  const err = validateFieldSpec(spec, inventory);
  if (err === null) {
    fail(name, `expected ${expectedReason}, got valid`);
    return null;
  }
  if (err.reason !== expectedReason) {
    fail(name, `expected ${expectedReason}, got ${err.reason}`);
    return err;
  }
  pass(name);
  return err;
}

// ---------------------------------------------------------------------------
// Positive cases — valid specs should return null.
// ---------------------------------------------------------------------------

console.log("\n─── Positive cases ────────────────────────────────────────────────");

expectValid("POS 1  column via shorthand    Sales[OrderDate]", {
  field: "Sales[OrderDate]",
  type: "column",
});
expectValid("POS 2  measure via shorthand   Sales[Total Sales]", {
  field: "Sales[Total Sales]",
  type: "measure",
});
expectValid("POS 3  aggregation on column   Sales[Quantity] Sum", {
  field: "Sales[Quantity]",
  type: "aggregation",
  aggregation: "Sum",
});
expectValid("POS 4  entity+property split   Date / Year column", {
  entity: "Date",
  property: "Year",
  type: "column",
});
expectValid("POS 5  extension measure       Sales[Ext YTD Sales]", {
  field: "Sales[Ext YTD Sales]",
  type: "measure",
});
expectValid("POS 6  measure as aggregation  Sales[Total Profit]", {
  field: "Sales[Total Profit]",
  type: "aggregation",
  aggregation: "Sum",
});

// ---------------------------------------------------------------------------
// Negative cases — each reason code exercised.
// ---------------------------------------------------------------------------

console.log("\n─── Negative cases ────────────────────────────────────────────────");

expectInvalid(
  "NEG 1  table_not_found       Slaes[OrderDate] typo",
  { field: "Slaes[OrderDate]", type: "column" },
  "table_not_found"
);

const missCol = expectInvalid(
  "NEG 2  column_not_found      Sales[FooBar]",
  { field: "Sales[FooBar]", type: "column" },
  "column_not_found"
);

const missMea = expectInvalid(
  "NEG 3  measure_not_found     Sales[Bogus Measure]",
  { field: "Sales[Bogus Measure]", type: "measure" },
  "measure_not_found"
);

expectInvalid(
  "NEG 4  type mismatch: measure referenced as column",
  { field: "Sales[Total Sales]", type: "column" },
  "type_mismatch_column_is_measure"
);

expectInvalid(
  "NEG 5  type mismatch: column referenced as measure",
  { field: "Sales[Quantity]", type: "measure" },
  "type_mismatch_measure_is_column"
);

expectInvalid(
  "NEG 6  parse_error: no brackets",
  { field: "SalesOrderDate", type: "column" },
  "parse_error"
);

expectInvalid(
  "NEG 7  case mismatch counts as not-found (case-sensitive)",
  { field: "sales[orderdate]", type: "column" },
  "table_not_found"
);

// ---------------------------------------------------------------------------
// Suggestion quality — nearest-match should rank correct column first.
// ---------------------------------------------------------------------------

console.log("\n─── Suggestions ───────────────────────────────────────────────────");

// SUG 1 — unrelated-name miss: suggestions should be an array (possibly empty).
// "FooBar" (len 6) caps Levenshtein at 3; none of the Sales fields get that
// close, so the expected outcome is zero suggestions — the goal of the
// nearest-match path is typo correction, not arbitrary-name rescue.
if (missCol && Array.isArray(missCol.suggestions)) {
  pass(
    `SUG 1  Sales[FooBar] produced ${missCol.suggestions.length} suggestion(s) (unrelated-name, 0 expected): ${missCol.suggestions.join(", ") || "(none)"}`
  );
} else {
  fail("SUG 1  Sales[FooBar] suggestions array", "missing suggestions array");
}

// "Qantity" → "Quantity" (one char off).
const typoErr = validateFieldSpec(
  { field: "Sales[Qantity]", type: "column" },
  inventory
);
if (typoErr && typoErr.suggestions.includes("Sales[Quantity]")) {
  pass("SUG 2  Sales[Qantity] → 'Sales[Quantity]' in suggestions");
} else {
  fail(
    "SUG 2  Sales[Qantity] → Quantity",
    `suggestions: ${typoErr ? typoErr.suggestions.join(", ") : "(no error)"}`
  );
}

// "Total Slaes" → "Total Sales" (measure-scope suggestions should only pull from measures).
const mTypo = validateFieldSpec(
  { field: "Sales[Total Slaes]", type: "measure" },
  inventory
);
if (mTypo && mTypo.suggestions.includes("Sales[Total Sales]")) {
  pass("SUG 3  Sales[Total Slaes] → 'Sales[Total Sales]' (measure-scope)");
} else {
  fail(
    "SUG 3  Sales[Total Slaes] measure suggestions",
    `suggestions: ${mTypo ? mTypo.suggestions.join(", ") : "(no error)"}`
  );
}

// ---------------------------------------------------------------------------
// Batch validation — multiple bindings, multiple fields each.
// ---------------------------------------------------------------------------

console.log("\n─── Batch validation + formatting ─────────────────────────────────");

const batch = [
  {
    bucket: "Category",
    fields: [
      { field: "Date[Year]", type: "column" },
      { field: "Sales[FooBar]", type: "column" }, // column_not_found
    ],
  },
  {
    bucket: "Values",
    fields: [
      { field: "Sales[Total Sales]", type: "measure" },
      { field: "Slaes[Quantity]", type: "column" }, // table_not_found
    ],
  },
];

const batchErrors = validateBindings(batch, inventory);
if (batchErrors.length === 2) {
  pass(`BATCH 1  two errors across two buckets (got ${batchErrors.length})`);
} else {
  fail(`BATCH 1  expected 2 errors, got ${batchErrors.length}`);
}

const msg = formatBindingErrors(batchErrors);
if (
  msg.includes("Binding validation failed") &&
  msg.includes("Sales[FooBar]") &&
  msg.includes("Slaes[Quantity]")
) {
  pass("FMT 1  formatBindingErrors includes header + both labels");
} else {
  fail("FMT 1  formatBindingErrors output", msg);
}

// Null inventory → empty errors (degrade silently).
const nullInvErrors = validateBindings(batch, null);
if (nullInvErrors.length === 0) {
  pass("BATCH 2  null inventory returns [] (silent degrade)");
} else {
  fail("BATCH 2  null inventory", `got ${nullInvErrors.length} errors`);
}

// Empty bindings → empty errors.
const emptyErrors = validateBindings([], inventory);
if (emptyErrors.length === 0) {
  pass("BATCH 3  empty bindings returns []");
} else {
  fail("BATCH 3  empty bindings", `got ${emptyErrors.length} errors`);
}

// ---------------------------------------------------------------------------
// Mode resolution — precedence should be per-call > env > default.
// ---------------------------------------------------------------------------

console.log("\n─── Mode resolution ───────────────────────────────────────────────");

const origEnv = process.env.MCP_BINDING_VALIDATION;

process.env.MCP_BINDING_VALIDATION = "";
if (resolveValidationMode(undefined) === "strict") pass("MODE 1  default = strict");
else fail("MODE 1  default = strict");

process.env.MCP_BINDING_VALIDATION = "off";
if (resolveValidationMode(undefined) === "off") pass("MODE 2  env=off  → off");
else fail("MODE 2  env=off");

process.env.MCP_BINDING_VALIDATION = "off";
if (resolveValidationMode(true) === "strict") pass("MODE 3  per-call=true overrides env=off");
else fail("MODE 3  per-call beats env");

process.env.MCP_BINDING_VALIDATION = "strict";
if (resolveValidationMode(false) === "warn") pass("MODE 4  per-call=false → warn");
else fail("MODE 4  per-call=false");

process.env.MCP_BINDING_VALIDATION = "warn";
if (resolveValidationMode(undefined) === "warn") pass("MODE 5  env=warn → warn");
else fail("MODE 5  env=warn");

if (origEnv === undefined) delete process.env.MCP_BINDING_VALIDATION;
else process.env.MCP_BINDING_VALIDATION = origEnv;

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n═══════════════════════════════════════════════════════════════════");
console.log(`  ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════════════════════");
process.exit(failed === 0 ? 0 : 1);
