#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const model_usage_js_1 = require("./model-usage.js");
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
    (0, model_usage_js_1.findSemanticModelPath)(resolved);
}
catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
}
// Build data + render
const data = (0, model_usage_js_1.buildFullData)(resolved);
const reportName = path.basename(resolved).replace(/\.Report$/, "");
const markdown = (0, model_usage_js_1.generateMarkdown)(data, reportName);
if (toStdout) {
    process.stdout.write(markdown);
}
else {
    const dest = outFile
        ? path.resolve(outFile)
        : path.join(path.dirname(resolved), `${reportName}-usage.md`);
    fs.writeFileSync(dest, markdown, "utf8");
    console.log(`✓ Written to ${dest}`);
    console.log(`  ${data.totals.measuresInModel} measures, ${data.totals.columnsInModel} columns, ${data.totals.tables} tables, ${data.totals.pages} pages`);
}
