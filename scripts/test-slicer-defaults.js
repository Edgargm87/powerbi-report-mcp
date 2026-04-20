#!/usr/bin/env node
// Regression test for slicer house defaults (width 184, height 60,
// title.show=false, header.show=true, textSize 8, items.textSize 8).
// See skills/slicers.md "House defaults" and src/helpers/createVisual.ts.

const { createAndSaveVisual } = require("../dist/helpers/createVisual.js");

const SLICER_TYPES = ["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"];

function makeFakeProject() {
  const saved = new Map();
  return {
    saved,
    saveVisual(_pageId, vid, visual) {
      saved.set(vid, visual);
    },
  };
}

function getContainerProp(visual, category, propName) {
  const entry = visual.visual?.visualContainerObjects?.[category];
  if (!Array.isArray(entry) || entry.length === 0) return undefined;
  return entry[0]?.properties?.[propName];
}

function getObjectProp(visual, category, propName) {
  const entry = visual.visual?.objects?.[category];
  if (!Array.isArray(entry) || entry.length === 0) return undefined;
  return entry[0]?.properties?.[propName];
}

function literalValue(wrapped) {
  // PBIR boolean/literal shape: { expr: { Literal: { Value: "true"/"false"/"8D"/... } } }
  if (!wrapped || typeof wrapped !== "object") return undefined;
  return wrapped?.expr?.Literal?.Value;
}

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    failures++;
  }
}

for (const visualType of SLICER_TYPES) {
  console.log(`\n${visualType}:`);
  const project = makeFakeProject();
  const spec = {
    visualType,
    bindings: [
      { bucket: "Values", fields: [{ field: "Sales[Region]", type: "column" }] },
    ],
  };
  const { visualId } = createAndSaveVisual(project, "pageA", spec, 0);
  const visual = project.saved.get(visualId);

  // Dimensions
  assert(visual.position.width === 184, `width defaults to 184 (got ${visual.position.width})`);
  assert(visual.position.height === 60, `height defaults to 60 (got ${visual.position.height})`);

  // Title off
  const titleShow = literalValue(getContainerProp(visual, "title", "show"));
  assert(titleShow === "false", `title.show === "false" (got ${titleShow})`);

  // Header on + font
  const headerShow = literalValue(getObjectProp(visual, "header", "show"));
  assert(headerShow === "true", `header.show === "true" (got ${headerShow})`);
  const headerSize = literalValue(getObjectProp(visual, "header", "textSize"));
  assert(headerSize === "8D", `header.textSize === 8 (got ${headerSize})`);

  // Items font
  const itemsSize = literalValue(getObjectProp(visual, "items", "textSize"));
  assert(itemsSize === "8D", `items.textSize === 8 (got ${itemsSize})`);
}

// --- User-title override: title.show should NOT be forced off when user passes title ---
console.log("\nuser-supplied title overrides title-off default:");
{
  const project = makeFakeProject();
  const { visualId } = createAndSaveVisual(
    project,
    "pageA",
    {
      visualType: "slicer",
      title: "Year",
      bindings: [{ bucket: "Values", fields: [{ field: "Date[Year]", type: "column" }] }],
    },
    0
  );
  const visual = project.saved.get(visualId);
  const titleShow = literalValue(getContainerProp(visual, "title", "show"));
  // When user passes title, we do NOT inject show=false. Either undefined (PBI defaults to on) or not "false".
  assert(titleShow !== "false", `title.show is not forced off when title is supplied (got ${titleShow})`);
  const titleText = literalValue(getContainerProp(visual, "title", "text"));
  assert(titleText === "'Year'", `title text set to 'Year' (got ${titleText})`);
}

// --- Non-slicer unaffected ---
console.log("\nnon-slicer (barChart) gets neither slicer defaults nor title-off:");
{
  const project = makeFakeProject();
  const { visualId } = createAndSaveVisual(
    project,
    "pageA",
    {
      visualType: "barChart",
      bindings: [
        { bucket: "Y", fields: [{ field: "Sales[Region]", type: "column" }] },
        { bucket: "X", fields: [{ field: "Sales[Amount]", type: "aggregation", aggregation: "Sum" }] },
      ],
    },
    0
  );
  const visual = project.saved.get(visualId);
  assert(visual.position.width === 280, `width default 280 (got ${visual.position.width})`);
  const titleShow = literalValue(getContainerProp(visual, "title", "show"));
  assert(titleShow !== "false", `title.show not forced off on barChart (got ${titleShow})`);
}

console.log("");
if (failures === 0) {
  console.log("✓ Slicer regression test passed.");
  process.exit(0);
} else {
  console.log(`✗ ${failures} slicer regression check(s) failed.`);
  process.exit(1);
}
