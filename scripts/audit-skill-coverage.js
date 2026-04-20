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
const DEFAULT_TOOLS_FILE = path.join(ROOT, "src", "default-tools.ts");

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const strict = args.includes("--strict");

// ---------------------------------------------------------------------------
// Step 0: parse the canonical DEFAULT_TOOLS set from src/default-tools.ts
// ---------------------------------------------------------------------------

function loadDefaultTools() {
  if (!fs.existsSync(DEFAULT_TOOLS_FILE)) return new Set();
  const src = fs.readFileSync(DEFAULT_TOOLS_FILE, "utf8");
  // Match every quoted entry inside `new Set([ ... ])`. We deliberately
  // don't try to parse TS — a flat regex over the literal entries is
  // robust as long as the file stays a single Set declaration.
  const set = new Set();
  const re = /["']([a-zA-Z0-9_]+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    set.add(m[1]);
  }
  return set;
}

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

function findCoverage(tools, skills, defaultSet) {
  const coverage = []; // { tool, skills: [skillName, ...], tier }
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
      tier: defaultSet.has(tool.name) ? "default" : "on-demand",
    });
  }
  return coverage;
}

// ---------------------------------------------------------------------------
// Step 4: render
// ---------------------------------------------------------------------------

function pct(num, denom) {
  if (denom === 0) return "0.0";
  return ((num / denom) * 100).toFixed(1);
}

function renderTable(coverage) {
  const covered = coverage.filter((c) => c.covered);
  const missing = coverage.filter((c) => !c.covered);

  const def = coverage.filter((c) => c.tier === "default");
  const ond = coverage.filter((c) => c.tier === "on-demand");
  const defCovered = def.filter((c) => c.covered);
  const ondCovered = ond.filter((c) => c.covered);

  console.log("");
  console.log("=".repeat(78));
  console.log("MCP Tool ↔ Skill Coverage Audit");
  console.log("=".repeat(78));
  console.log("");
  console.log(`Tools registered:   ${coverage.length}`);
  console.log(`With skill mention: ${covered.length}`);
  console.log(`Missing coverage:   ${missing.length}`);
  console.log(`Coverage:           ${pct(covered.length, coverage.length)}%`);
  console.log("");
  console.log(`  Default tools:    ${defCovered.length}/${def.length}  (${pct(defCovered.length, def.length)}%)`);
  console.log(`  On-demand tools:  ${ondCovered.length}/${ond.length}  (${pct(ondCovered.length, ond.length)}%)`);
  console.log("");

  if (missing.length > 0) {
    console.log("─".repeat(78));
    console.log("MISSING (no backtick mention in any skills/*.md):");
    console.log("─".repeat(78));
    const nameW = Math.max(...missing.map((m) => m.name.length));
    for (const m of missing) {
      const tierTag = m.tier === "default" ? "[DEFAULT] " : "          ";
      console.log(`  ${tierTag}${m.name.padEnd(nameW)}  ${m.file}`);
    }
    console.log("");
    if (missing.some((m) => m.tier === "default")) {
      console.log("⚠ A default tool is missing skill coverage — every default tool MUST");
      console.log("  have a backtick mention in at least one skills/*.md file. These are");
      console.log("  the tools loaded into every session and seen by every LLM client.");
      console.log("");
    }
  }

  console.log("─".repeat(78));
  console.log("COVERED:");
  console.log("─".repeat(78));
  const nameW2 = Math.max(...covered.map((c) => c.name.length), 1);
  for (const c of covered) {
    const tierTag = c.tier === "default" ? "[DEFAULT] " : "          ";
    console.log(`  ${tierTag}${c.name.padEnd(nameW2)}  → ${c.skills.join(", ")}`);
  }
  console.log("");
}

function renderJson(coverage) {
  const covered = coverage.filter((c) => c.covered);
  const missing = coverage.filter((c) => !c.covered);
  const def = coverage.filter((c) => c.tier === "default");
  const ond = coverage.filter((c) => c.tier === "on-demand");
  console.log(
    JSON.stringify(
      {
        summary: {
          total: coverage.length,
          covered: covered.length,
          missing: missing.length,
          coveragePct: Number(pct(covered.length, coverage.length)),
          default: {
            total: def.length,
            covered: def.filter((c) => c.covered).length,
            coveragePct: Number(pct(def.filter((c) => c.covered).length, def.length)),
          },
          onDemand: {
            total: ond.length,
            covered: ond.filter((c) => c.covered).length,
            coveragePct: Number(pct(ond.filter((c) => c.covered).length, ond.length)),
          },
        },
        missing: missing.map((m) => ({ name: m.name, file: m.file, tier: m.tier })),
        covered: covered.map((c) => ({ name: c.name, skills: c.skills, tier: c.tier })),
      },
      null,
      2
    )
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step 5: verify every skill file has a summary line
//
// Every skills/*.md must have `<!-- summary: ... -->` somewhere in its top
// few lines. The banner builder in src/tools/guide.ts reads this at session
// start and surfaces each skill's one-line description to the agent without
// needing to load the whole file. A missing summary means the skill is
// invisible in the session-start index, which is a doc regression.
// ---------------------------------------------------------------------------

function auditSummaries(skills) {
  const missing = [];
  for (const s of skills) {
    const head = s.content.split(/\r?\n/).slice(0, 8).join("\n");
    if (!/<!--\s*summary:\s*[^]*?-->/i.test(head)) {
      missing.push(s.file);
    }
  }
  return missing;
}

function main() {
  const tools = collectTools();
  const skills = collectSkills();
  const defaultSet = loadDefaultTools();
  const coverage = findCoverage(tools, skills, defaultSet);
  const missingSummaries = auditSummaries(skills);

  if (wantJson) {
    renderJson(coverage);
  } else {
    renderTable(coverage);
    if (missingSummaries.length > 0) {
      console.log("─".repeat(78));
      console.log("SKILLS MISSING <!-- summary: ... --> FRONTMATTER:");
      console.log("─".repeat(78));
      for (const f of missingSummaries) {
        console.log(`  ${f}`);
      }
      console.log("");
      console.log("⚠ Every skills/*.md needs a summary line in its top 8 lines so the");
      console.log("  session-start banner can index it. Example:");
      console.log("    <!-- summary: one-line description, ≤ 180 chars -->");
      console.log("");
    }
  }

  const regressions =
    (strict && coverage.some((c) => !c.covered)) || missingSummaries.length > 0;
  if (strict && regressions) {
    process.exit(1);
  }
}

main();
