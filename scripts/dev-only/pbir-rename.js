#!/usr/bin/env node
/**
 * One-shot rename utility for the v0.8.0 pbir_* tool prefix migration.
 *
 * Scans a curated list of files (src/**, scripts/**, skills/**, plugin/**,
 * README.md, *.md) and replaces every bare tool-name occurrence with the
 * pbir_-prefixed form. Two passes:
 *
 *   1. word-boundary replace: `\bNAME\b` → `pbir_NAME`
 *   2. skip if already prefixed (the regex naturally avoids `pbir_NAME`
 *      because \b doesn't match between `_` and a letter when the prior
 *      char is also part of the word — but we double-check with a guard)
 *
 * Run from repo root: node scripts/dev-only/pbir-rename.js
 *
 * Idempotent: re-running on already-renamed files produces no changes.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const NAMES = [
  "add_bookmark","add_page_filter","add_visual","add_visual_calculation",
  "apply_theme","audit_theme_compliance","auto_layout","bulk_bind",
  "bulk_delete_visuals","bulk_update_format","change_visual_type","clear_filters",
  "create_page","delete_bookmark","delete_page","delete_visual",
  "delete_visual_calculation","diff_report_theme","duplicate_page","duplicate_visual",
  "format_visual","get_report","get_report_settings","get_report_theme",
  "get_visual","get_visual_types","guide","layout_grid","list_bookmarks",
  "list_filters","list_pages","list_report_themes","list_visual_calculations",
  "list_visuals","load_tools","lookup_theme_property","manage_extension_measures",
  "model_usage","move_visual","reload_report","remove_filter","remove_report_theme",
  "rename_bookmark","rename_page","reorder_pages","set_active_page",
  "set_conditional_format","set_datapoint_colors","set_filter_pane",
  "set_page_background","set_page_visibility","set_report","set_report_theme",
  "set_visual_interaction","set_visual_sort","set_visual_title","update_page_size",
  "update_report_settings","update_visual_bindings",
];

// Sort longest-first so e.g. set_report_theme is replaced before set_report
NAMES.sort((a, b) => b.length - a.length);

function listFiles() {
  const out = [];
  const want = (p) => /\.(ts|js|md|json)$/.test(p);
  const skip = new Set(["node_modules", "dist", ".git", "coverage", ".cache"]);
  const SELF = path.resolve(__filename);
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (want(full) && path.resolve(full) !== SELF) out.push(full);
    }
  }
  walk(path.join(ROOT, "src"));
  walk(path.join(ROOT, "scripts"));
  walk(path.join(ROOT, "skills"));
  walk(path.join(ROOT, "plugin"));
  for (const f of ["README.md", "package.json"]) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) out.push(full);
  }
  return out;
}

const STATS = { filesChanged: 0, totalReplacements: 0, perName: {} };

// Names that collide with English / domain words and would generate false
// positives if matched bare. Replace only when wrapped in backticks, or
// immediately followed by `(`, or in the form "tool" registration string.
const AMBIGUOUS = new Set(["guide"]);

function renameInText(text) {
  let out = text;
  let count = 0;
  for (const name of NAMES) {
    // Negative lookbehind: don't re-prefix `pbir_NAME`. Word boundary on right
    // catches `name(`, `name`, `name:`, `name,` etc.
    const re = AMBIGUOUS.has(name)
      // Only match `guide` when it's a tool reference: backticked, called as
      // `guide(`, or quoted as a string literal "guide" — never bare prose.
      ? new RegExp(`(\`)${name}(?=[\`(:{ ])|(["'])${name}(["'])`, "g")
      : new RegExp(`(?<![A-Za-z0-9_])${name}\\b`, "g");
    let localCount = 0;
    out = out.replace(re, (match, p1, p2, p3) => {
      localCount++;
      if (AMBIGUOUS.has(name)) {
        // Preserve the matched delimiters around the renamed token.
        if (p1 === "`") return "`pbir_" + name;
        if (p2 === "\"" || p2 === "'") return p2 + "pbir_" + name + p3;
      }
      return `pbir_${name}`;
    });
    if (localCount) {
      STATS.perName[name] = (STATS.perName[name] || 0) + localCount;
      count += localCount;
    }
  }
  return { out, count };
}

function main() {
  const files = listFiles();
  for (const f of files) {
    const orig = fs.readFileSync(f, "utf8");
    const { out, count } = renameInText(orig);
    if (count > 0 && out !== orig) {
      fs.writeFileSync(f, out, "utf8");
      STATS.filesChanged++;
      STATS.totalReplacements += count;
    }
  }
  console.log(`Files changed:       ${STATS.filesChanged}`);
  console.log(`Total replacements:  ${STATS.totalReplacements}`);
  const top = Object.entries(STATS.perName).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`Top names:`);
  for (const [n, c] of top) console.log(`  ${n.padEnd(28)} ${c}`);
}

main();
