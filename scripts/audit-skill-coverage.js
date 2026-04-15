#!/usr/bin/env node
/**
 * audit-skill-coverage.js
 *
 * Cross-references every MCP tool registered under src/tools/*.ts against
 * the prose knowledge in skills/*.md, and prints which tools are missing
 * skill coverage.
 *
 * Why: tools are the executable surface, skills are the prose that teaches
 * an LLM agent how to wield them. When the two drift, agents pick wrong
 * params or miss whole tools entirely. This audit is the gate that keeps
 * them in sync — a tool added without a matching skill mention is a doc
 * regression that should fail CI.
 *
 * Usage:
 *   node scripts/audit-skill-coverage.js          # human-readable table
 *   node scripts/audit-skill-coverage.js --json   # machine-readable JSON
 *   node scripts/audit-skill-coverage.js --strict # exit 1 if any tool has 0 coverage
 *
 * Detection rules:
 *   tool name      ← /server\.tool\(\s*["']([a-z_]+)["']/  in src/tools/*.ts
 *   skill mention  ← `toolName` (in backticks) anywhere in skills/*.md
 *
 * The backtick requirement keeps casual prose mentions ("the visual list")
 * from masking real coverage gaps — a skill that doesn't show the literal
 * tool name in code formatting hasn't actually documented the tool.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TOOLS_DIR = path.join(ROOT, "src", "tools");
const SKILLS_DIR = path.join(ROOT, "skills");
const INDEX_FILE = path.join(ROOT, "src", "index.ts");

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const strict = args.includes("--strict");

// ---------------------------------------------------------------------------
// Step 1: collect every registered tool from src/tools/*.ts
// ---------------------------------------------------------------------------

function collectTools() {
  // Read index.ts to find which register functions are actually wired up.
  // A tool file is "parked" if its register call is commented out — we skip
  // its tools so the audit reflects the real surface area, not dead code.
  const indexSrc = fs.readFileSync(INDEX_FILE, "utf8");
  const isRegistered = (registerFnName) => {
    // Must appear as a non-commented call: `registerXxxTools(server, ctx)`
    const re = new RegExp("^[^/\\n]*\\b" + registerFnName + "\\s*\\(", "m");
    return re.test(indexSrc);
  };

  // Files to scan: every src/tools/*.ts plus a handful of root-level files
  // that also register tools (model-usage.ts, index.ts itself for load_tools).
  const targetFiles = [];
  for (const f of fs.readdirSync(TOOLS_DIR)) {
    if (f.endsWith(".ts")) {
      targetFiles.push({ file: `src/tools/${f}`, full: path.join(TOOLS_DIR, f) });
    }
  }
  targetFiles.push({
    file: "src/model-usage.ts",
    full: path.join(ROOT, "src", "model-usage.ts"),
  });
  targetFiles.push({ file: "src/index.ts", full: INDEX_FILE });

  const tools = []; // { name, file }
  for (const { file, full } of targetFiles) {
    const src = fs.readFileSync(full, "utf8");

    // If this file exports a register function, only count it when wired
    const regFn = src.match(/export\s+function\s+(register\w+)/);
    if (regFn && !isRegistered(regFn[1])) continue;

    // Match: server.tool("name", ...) OR _tool("name", ...) (used in index.ts
    // for the inline load_tools registration). Only the name needs to be a
    // string literal; the description may be a string, backtick template, or
    // a constant identifier.
    const re = /(?:server\.tool|_tool)\(\s*["']([a-zA-Z0-9_]+)["']/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      tools.push({ name: m[1], file });
    }
  }

  // Deduplicate (index.ts has both a Proxy override of server.tool and the
  // inline _tool calls — same name shouldn't appear twice)
  const seen = new Set();
  const unique = tools.filter((t) => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });

  // Deterministic order
  unique.sort((a, b) => a.name.localeCompare(b.name));
  return unique;
}

// ---------------------------------------------------------------------------
// Step 2: collect every skill file and its content
// ---------------------------------------------------------------------------

function collectSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => ({
      file: `skills/${f}`,
      name: f.replace(/\.md$/, ""),
      content: fs.readFileSync(path.join(SKILLS_DIR, f), "utf8"),
    }));
}

// ---------------------------------------------------------------------------
// Step 3: for each tool, find skill mentions
// ---------------------------------------------------------------------------

function findCoverage(tools, skills) {
  const coverage = []; // { tool, skills: [skillName, ...] }
  for (const tool of tools) {
    // Require backtick-wrapped mention of the tool name.
    // Matches: `add_visual`, `add_visual(`, `add_visual({`, `add_visual:`
    const needle = new RegExp("`" + tool.name + "[`(:{ ]");
    const matched = skills
      .filter((s) => needle.test(s.content))
      .map((s) => s.name);
    coverage.push({
      ...tool,
      skills: matched,
      covered: matched.length > 0,
    });
  }
  return coverage;
}

// ---------------------------------------------------------------------------
// Step 4: render
// ---------------------------------------------------------------------------

function renderTable(coverage) {
  const covered = coverage.filter((c) => c.covered);
  const missing = coverage.filter((c) => !c.covered);

  console.log("");
  console.log("=".repeat(78));
  console.log("MCP Tool ↔ Skill Coverage Audit");
  console.log("=".repeat(78));
  console.log("");
  console.log(`Tools registered:   ${coverage.length}`);
  console.log(`With skill mention: ${covered.length}`);
  console.log(`Missing coverage:   ${missing.length}`);
  console.log(
    `Coverage:           ${((covered.length / coverage.length) * 100).toFixed(1)}%`
  );
  console.log("");

  if (missing.length > 0) {
    console.log("─".repeat(78));
    console.log("MISSING (no backtick mention in any skills/*.md):");
    console.log("─".repeat(78));
    const nameW = Math.max(...missing.map((m) => m.name.length));
    for (const m of missing) {
      console.log(`  ${m.name.padEnd(nameW)}  ${m.file}`);
    }
    console.log("");
  }

  console.log("─".repeat(78));
  console.log("COVERED:");
  console.log("─".repeat(78));
  const nameW2 = Math.max(...covered.map((c) => c.name.length), 1);
  for (const c of covered) {
    console.log(`  ${c.name.padEnd(nameW2)}  → ${c.skills.join(", ")}`);
  }
  console.log("");
}

function renderJson(coverage) {
  const covered = coverage.filter((c) => c.covered);
  const missing = coverage.filter((c) => !c.covered);
  console.log(
    JSON.stringify(
      {
        summary: {
          total: coverage.length,
          covered: covered.length,
          missing: missing.length,
          coveragePct: Number(((covered.length / coverage.length) * 100).toFixed(1)),
        },
        missing: missing.map((m) => ({ name: m.name, file: m.file })),
        covered: covered.map((c) => ({ name: c.name, skills: c.skills })),
      },
      null,
      2
    )
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const tools = collectTools();
  const skills = collectSkills();
  const coverage = findCoverage(tools, skills);

  if (wantJson) {
    renderJson(coverage);
  } else {
    renderTable(coverage);
  }

  if (strict && coverage.some((c) => !c.covered)) {
    process.exit(1);
  }
}

main();
