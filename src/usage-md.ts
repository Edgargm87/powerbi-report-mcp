#!/usr/bin/env node
/**
 * Markdown usage report generator.
 *
 * Reads a .Report folder + its sibling .SemanticModel folder and writes
 * a Markdown report matching the 9 HTML dashboard tabs (measures, columns,
 * tables, relationships, functions, calc groups, pages, unused, lineage).
 *
 * Usage:
 *   node dist/usage-md.js <path-to-.Report-folder>           → writes model-usage.md next to the report
 *   node dist/usage-md.js <path-to-.Report-folder> --stdout   → prints to stdout
 *   node dist/usage-md.js <path-to-.Report-folder> -o out.md  → writes to a specific file
 */
import * as path from "path";
import * as fs from "fs";
import { buildFullData, generateMarkdown, findSemanticModelPath } from "./model-usage.js";

const args = process.argv.slice(2);
const toStdout = args.includes("--stdout");
const outIdx = args.indexOf("-o");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const reportPath = args.find(a => !a.startsWith("-"));

if (!reportPath) {
  console.error("Usage: node dist/usage-md.js <path-to-.Report-folder> [--stdout] [-o output.md]");
  console.error("  e.g. node dist/usage-md.js ./my-project/Sales.Report");
  console.error("       node dist/usage-md.js ./my-project/Sales.Report --stdout");
  console.error("       node dist/usage-md.js ./my-project/Sales.Report -o report.md");
  process.exit(1);
}

const resolved = path.resolve(reportPath);
if (!fs.existsSync(resolved)) {
  console.error(`Path not found: ${resolved}`);
  process.exit(1);
}

// Verify model exists
try {
  findSemanticModelPath(resolved);
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
}

// Build data + render
const data = buildFullData(resolved);
const reportName = path.basename(resolved).replace(/\.Report$/, "");
const markdown = generateMarkdown(data, reportName);

if (toStdout) {
  process.stdout.write(markdown);
} else {
  const dest = outFile
    ? path.resolve(outFile)
    : path.join(path.dirname(resolved), `${reportName}-usage.md`);
  fs.writeFileSync(dest, markdown, "utf8");
  console.log(`✓ Written to ${dest}`);
  console.log(`  ${data.totals.measuresInModel} measures, ${data.totals.columnsInModel} columns, ${data.totals.tables} tables, ${data.totals.pages} pages`);
}
