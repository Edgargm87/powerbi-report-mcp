#!/usr/bin/env node
// Smoke test for src/helpers/extractTitle.ts
// Verifies the centralized title extractor handles the same shapes that the
// old inline code did (visuals.ts, report.ts get_page_summary).

const { extractVisualTitle } = require("../dist/helpers/extractTitle.js");

const tests = [
  // [input, expected, label]
  [undefined, null, "undefined input"],
  [null, null, "null input"],
  [{}, null, "empty object (no title)"],
  [{ title: [] }, null, "empty title array"],
  [{ title: [{}] }, null, "title entry with no properties"],
  [
    { title: [{ properties: { text: { expr: { Literal: { Value: "'Hello World'" } } } } }] },
    "Hello World",
    "single-quote-wrapped title",
  ],
  [
    { title: [{ properties: { text: { expr: { Literal: { Value: "NoQuotes" } } } } }] },
    "NoQuotes",
    "unwrapped title",
  ],
  [
    { title: [{ properties: { text: { expr: { Literal: { Value: "''" } } } } }] },
    null,
    "empty string wrapped in quotes",
  ],
  [
    { title: [{ properties: { text: { expr: { Literal: { Value: "" } } } } }] },
    null,
    "empty string literal",
  ],
  [
    { title: [{ properties: { text: { expr: { Literal: { Value: 42 } } } } }] },
    null,
    "non-string literal (number)",
  ],
  [
    { title: "not an array" },
    null,
    "title is not an array",
  ],
  [
    { title: [{ properties: { text: { expr: { Literal: { Value: "'Has \"quotes\" inside'" } } } } }] },
    'Has "quotes" inside',
    "title with internal double-quotes",
  ],
];

console.log("\n═══════════════════════════════════════════════════════════════════");
console.log("  extractVisualTitle — smoke test");
console.log("═══════════════════════════════════════════════════════════════════");

let pass = 0;
let fail = 0;
for (const [input, expected, label] of tests) {
  const got = extractVisualTitle(input);
  if (got === expected) {
    console.log(`  ✓ ${label} → ${JSON.stringify(got)}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}  expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    fail++;
  }
}

console.log("\n═══════════════════════════════════════════════════════════════════");
console.log(`  ${pass} passed, ${fail} failed`);
console.log("═══════════════════════════════════════════════════════════════════");

process.exit(fail === 0 ? 0 : 1);
