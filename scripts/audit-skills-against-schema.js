#!/usr/bin/env node
/**
 * audit-skills-against-schema.js
 *
 * Sanity-check: scan skills/*.md for JSON snippets that claim pbir_format_visual /
 * pbir_add_visual / theme patterns, extract their {category, properties} pairs,
 * and flag any category or property that isn't present anywhere in the
 * bundled theme schema. Hand-written docs drift; this is the CI gate.
 *
 * What it catches:
 *   - Typos like "labls" → "labels"
 *   - Removed/renamed PBI properties (after a schema bump)
 *   - Copy-paste errors in example blocks
 *
 * What it does NOT catch:
 *   - Valid-for-type-A-but-not-type-B mistakes (we collapse across all types
 *     for docs because examples don't always specify visualType — trade-off)
 *   - Semantic issues ("show this but show that makes no sense")
 *
 * Exit 0 when clean, 1 when drift detected.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const SCHEMAS_DIR = path.join(ROOT, "schemas");

// ---------------------------------------------------------------------------
// Load the schema and build a flat set of all valid category + property names
// across all visualTypes.
// ---------------------------------------------------------------------------

function loadSchema() {
  const files = fs
    .readdirSync(SCHEMAS_DIR)
    .filter((f) => /^reportThemeSchema-[\d.]+\.json$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error("No reportThemeSchema-*.json in schemas/");
  return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, files[0]), "utf8"));
}

function resolveRef(schema, ref) {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let node = schema;
  for (const p of parts) {
    if (node && typeof node === "object" && p in node) node = node[p];
    else return null;
  }
  return node;
}

function collectKnownNames(schema) {
  const categories = new Set();
  const properties = new Set();
  const defs = schema.definitions || {};

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string") {
      walk(resolveRef(schema, node.$ref));
      return;
    }
    if (Array.isArray(node.allOf)) for (const a of node.allOf) walk(a);
    const props = node.properties;
    if (!props) return;
    for (const [catName, catSpec] of Object.entries(props)) {
      if (!catSpec || typeof catSpec !== "object") continue;
      categories.add(catName);
      let items = catSpec.items;
      if (items && typeof items.$ref === "string") items = resolveRef(schema, items.$ref);
      const itemProps = items?.properties;
      if (itemProps) for (const p of Object.keys(itemProps)) properties.add(p);
    }
  };

  for (const [name, def] of Object.entries(defs)) {
    if (name.startsWith("visual-")) walk(def);
  }
  return { categories, properties };
}

// ---------------------------------------------------------------------------
// Extract fenced JSON blocks and find { category, properties } pairs.
// ---------------------------------------------------------------------------

function extractFencedBlocks(md) {
  const blocks = [];
  const re = /```(?:json|jsonc|javascript|js)?\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(md))) blocks.push(m[1]);
  return blocks;
}

function findCategoryPropertyPairs(fileName, block) {
  // Try full JSON parse first; skill blocks often have surrounding prose
  // and embedded JS, so fall back to a regex walker when parse fails.
  const pairs = [];
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      // try to extract a substring — find first "{" and matching bracket
      const start = s.indexOf("{");
      const arrStart = s.indexOf("[");
      if (start === -1 && arrStart === -1) return null;
      // Greedy — just see if we can parse from first brace.
      for (let end = s.length; end > start; end--) {
        try {
          return JSON.parse(s.slice(start, end));
        } catch {
          // keep shrinking
        }
      }
      return null;
    }
  };

  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    // Shape A: { category: "X", properties: { ... } }
    if (typeof node.category === "string" && node.properties && typeof node.properties === "object") {
      pairs.push({
        category: node.category,
        properties: Object.keys(node.properties),
        file: fileName,
      });
    }
    // Shape B: { visualStyles: { type: { category: [{ prop: ... }] } } }
    if (node.visualStyles && typeof node.visualStyles === "object") {
      for (const [, typeSpec] of Object.entries(node.visualStyles)) {
        if (!typeSpec || typeof typeSpec !== "object") continue;
        for (const [catName, catArr] of Object.entries(typeSpec)) {
          if (!Array.isArray(catArr)) continue;
          for (const entry of catArr) {
            if (!entry || typeof entry !== "object") continue;
            pairs.push({
              category: catName,
              properties: Object.keys(entry),
              file: fileName,
            });
          }
        }
      }
    }
    for (const v of Object.values(node)) visit(v);
  };

  const parsed = tryParse(block);
  if (parsed) visit(parsed);
  return pairs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const schema = loadSchema();
  const { categories: knownCats, properties: knownProps } = collectKnownNames(schema);
  // Common non-theme keys we should not flag (they appear in properties blocks
  // that are actually PBIR literals, not theme keys).
  const allowlist = new Set([
    "show", // universally valid
    "expr", // PBIR expression wrapper — leaks into examples
    "Literal",
    "Value",
  ]);

  const skillFiles = fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(SKILLS_DIR, f));

  const unknownCats = new Map(); // catName → Set(file)
  const unknownProps = new Map(); // `${cat}.${prop}` → Set(file)
  let totalPairs = 0;

  for (const file of skillFiles) {
    const md = fs.readFileSync(file, "utf8");
    const fileName = path.basename(file);
    for (const block of extractFencedBlocks(md)) {
      const pairs = findCategoryPropertyPairs(fileName, block);
      totalPairs += pairs.length;
      for (const pair of pairs) {
        if (!knownCats.has(pair.category)) {
          if (!unknownCats.has(pair.category)) unknownCats.set(pair.category, new Set());
          unknownCats.get(pair.category).add(fileName);
          continue;
        }
        for (const prop of pair.properties) {
          if (allowlist.has(prop)) continue;
          if (knownProps.has(prop)) continue;
          const key = `${pair.category}.${prop}`;
          if (!unknownProps.has(key)) unknownProps.set(key, new Set());
          unknownProps.get(key).add(fileName);
        }
      }
    }
  }

  console.log(`Scanned ${skillFiles.length} skill files, found ${totalPairs} {category, properties} pairs.`);
  console.log(`Schema has ${knownCats.size} distinct categories, ${knownProps.size} distinct properties.`);
  console.log("");

  let fail = false;

  if (unknownCats.size > 0) {
    fail = true;
    console.log("✗ Unknown categories referenced in skill docs:");
    for (const [cat, files] of [...unknownCats.entries()].sort()) {
      console.log(`  - ${cat}   (in: ${[...files].join(", ")})`);
    }
    console.log("");
  }

  if (unknownProps.size > 0) {
    fail = true;
    console.log("✗ Unknown properties referenced in skill docs:");
    for (const [key, files] of [...unknownProps.entries()].sort()) {
      console.log(`  - ${key}   (in: ${[...files].join(", ")})`);
    }
    console.log("");
  }

  if (!fail) {
    console.log("✓ All referenced categories and properties match the bundled schema.");
    process.exit(0);
  } else {
    console.log("Docs contain references that don't exist in the bundled schema.");
    console.log("Either fix the doc (typo), or refresh the schema:");
    console.log("  node scripts/refresh-theme-schema.js");
    process.exit(1);
  }
}

main();
