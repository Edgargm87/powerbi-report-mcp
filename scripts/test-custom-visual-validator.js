// ═══════════════════════════════════════════════════════════════════════════════
// Custom-Visual Availability Validator — Test Runner
//
// Locks in the fix for the class of bug found while reusing a colleague's
// "HTML Content" custom visual: a visualType that isn't registered in the
// report's publicCustomVisuals renders as a broken visual in Desktop even
// though the PBIR JSON is well-formed. Covers:
//
//   TYPE 1-4  — isCustomVisualType() GUID-suffix heuristic (positive/negative)
//   REG 1-2   — getRegisteredCustomVisuals() happy path + safe-on-throw
//   CHK 1-5   — checkCustomVisualsAvailable() strict/warn/off across native
//               and custom visualTypes, registered and unregistered
//
// Run:  node scripts/test-custom-visual-validator.js
// ═══════════════════════════════════════════════════════════════════════════════

const {
  isCustomVisualType,
  getRegisteredCustomVisuals,
  checkCustomVisualsAvailable,
} = require("../dist/helpers/customVisualValidation.js");

let passed = 0;
let failed = 0;
function pass(n) { console.log(`  ✓ ${n}`); passed++; }
function fail(n, d) { console.log(`  ✗ ${n}`); if (d) console.log(`      ${d}`); failed++; }
function check(n, cond, detail) { cond ? pass(n) : fail(n, detail); }

const HTML_CONTENT = "htmlContent443BE3AD55E043BF878BED274D3A6855";
const OTHER_CUSTOM = "PBI_CV_1A2B3C4D5E6F7089A1B2C3D4E5F60718";

// ---------------------------------------------------------------------------
console.log("\n─── TYPE — isCustomVisualType() GUID-suffix heuristic ────────────");
check("TYPE 1  htmlContent+32hex is custom", isCustomVisualType(HTML_CONTENT) === true);
check("TYPE 2  native 'clusteredColumnChart' is not custom", isCustomVisualType("clusteredColumnChart") === false);
check("TYPE 3  bare 32-hex with no prefix is not custom (no room for a prefix)",
  isCustomVisualType("443BE3AD55E043BF878BED274D3A6855") === false);
check("TYPE 4  short native 'card' is not custom", isCustomVisualType("card") === false);
check("TYPE 5  second custom-visual naming style also detected", isCustomVisualType(OTHER_CUSTOM) === true);

// ---------------------------------------------------------------------------
console.log("\n─── REG — getRegisteredCustomVisuals() ───────────────────────────");
{
  const projectOk = { getReport: () => ({ publicCustomVisuals: [HTML_CONTENT] }) };
  check("REG 1  reads publicCustomVisuals off report.json",
    JSON.stringify(getRegisteredCustomVisuals(projectOk)) === JSON.stringify([HTML_CONTENT]));

  const projectMissingField = { getReport: () => ({}) };
  check("REG 2  missing publicCustomVisuals field → []",
    JSON.stringify(getRegisteredCustomVisuals(projectMissingField)) === JSON.stringify([]));

  const projectThrows = { getReport: () => { throw new Error("no report.json"); } };
  check("REG 3  getReport() throwing → [] (never bubbles)",
    JSON.stringify(getRegisteredCustomVisuals(projectThrows)) === JSON.stringify([]));
}

// ---------------------------------------------------------------------------
console.log("\n─── CHK — checkCustomVisualsAvailable() ──────────────────────────");
{
  const registeredProject = { getReport: () => ({ publicCustomVisuals: [HTML_CONTENT] }) };
  const emptyProject = { getReport: () => ({ publicCustomVisuals: [] }) };

  const r1 = checkCustomVisualsAvailable(registeredProject, ["clusteredColumnChart", "card"], undefined);
  check("CHK 1  all-native batch always proceeds", r1.proceed === true && r1.unregistered.length === 0);

  const r2 = checkCustomVisualsAvailable(registeredProject, [HTML_CONTENT, "card"], undefined);
  check("CHK 2  custom type that IS registered proceeds", r2.proceed === true && r2.unregistered.length === 0);

  const r3 = checkCustomVisualsAvailable(emptyProject, [HTML_CONTENT], undefined);
  check("CHK 3  unregistered custom type BLOCKS in default (strict) mode",
    r3.proceed === false && r3.mode === "strict" && r3.unregistered.includes(HTML_CONTENT),
    JSON.stringify(r3));

  const r4 = checkCustomVisualsAvailable(emptyProject, [HTML_CONTENT], false);
  check("CHK 4  strictCustomVisual:false → warn mode proceeds but still lists it",
    r4.proceed === true && r4.mode === "warn" && r4.unregistered.includes(HTML_CONTENT),
    JSON.stringify(r4));

  const r5 = checkCustomVisualsAvailable(emptyProject, [HTML_CONTENT], true);
  check("CHK 5  strictCustomVisual:true explicit → still blocks",
    r5.proceed === false && r5.mode === "strict");

  process.env.MCP_CUSTOM_VISUAL_VALIDATION = "off";
  const r6 = checkCustomVisualsAvailable(emptyProject, [HTML_CONTENT], undefined);
  check("CHK 6  env=off → proceeds, mode='off'", r6.proceed === true && r6.mode === "off");
  delete process.env.MCP_CUSTOM_VISUAL_VALIDATION;

  const r7 = checkCustomVisualsAvailable(emptyProject, [HTML_CONTENT, HTML_CONTENT, "card"], false);
  check("CHK 7  duplicate unregistered types de-duplicated in output",
    r7.unregistered.length === 1, JSON.stringify(r7.unregistered));

  const r8 = checkCustomVisualsAvailable(registeredProject, [], undefined);
  check("CHK 8  empty visualTypes array always proceeds", r8.proceed === true);
}

// ---------------------------------------------------------------------------
console.log(`\n═══════════════════════════════════════════════════════════════════`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
