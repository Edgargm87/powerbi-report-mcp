#!/usr/bin/env node
/**
 * test-skills-index.js
 *
 * Smoke-test for the session-start skills index banner produced by
 * src/tools/guide.ts :: buildSkillsIndexBanner(). This is what agents see
 * when they connect via set_report, so a regression here silently starves
 * every new session of its knowledge-base pointer.
 *
 * Asserts:
 *   1. Every skills/*.md key shows up in the banner as a `- **key** — ...` bullet.
 *   2. Each bullet carries a non-placeholder summary line (not "(no summary)").
 *   3. The two always-inline skills (wireframes, report-design) appear as
 *      `## Inlined: <name>.md` sections with their bodies substantially present.
 *   4. The priority skills (wireframes → report-design → visuals → formatting)
 *      appear in that order at the top of the index.
 *
 * Run:   node scripts/test-skills-index.js
 * Strict mode is the default — exit 1 on any failure so CI can gate on it.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");

// Import the builder. The source is TS; we rely on `npm run build` having
// produced dist/. If dist/ is missing we bail with a clear message rather
// than cryptic require failures.
function loadBuilder() {
  const distPath = path.join(ROOT, "dist", "tools", "guide.js");
  if (!fs.existsSync(distPath)) {
    console.error(
      "ERROR: dist/tools/guide.js is missing. Run `npm run build` before `node scripts/test-skills-index.js`."
    );
    process.exit(2);
  }
  return require(distPath);
}

function listSkillKeys() {
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

function fail(label, detail) {
  console.error(`✗ ${label}`);
  if (detail) console.error(`  ${detail}`);
  process.exitCode = 1;
}

function pass(label) {
  console.log(`✓ ${label}`);
}

function main() {
  const { buildSkillsIndexBanner, listTopicsWithSummaries } = loadBuilder();
  if (typeof buildSkillsIndexBanner !== "function") {
    console.error("ERROR: buildSkillsIndexBanner not exported from guide.js");
    process.exit(2);
  }

  const banner = buildSkillsIndexBanner();
  const keys = listSkillKeys();

  // 1. Every skill is present as a bullet
  const missingFromIndex = [];
  for (const k of keys) {
    // Accept either `- **key** —` or `- **key** -` (dash variants).
    const re = new RegExp(`^- \\*\\*${k}\\*\\* [—-]`, "m");
    if (!re.test(banner)) missingFromIndex.push(k);
  }
  if (missingFromIndex.length === 0) {
    pass(`All ${keys.length} skill keys appear in banner index`);
  } else {
    fail("Some skills missing from banner index", missingFromIndex.join(", "));
  }

  // 2. No "(no summary)" placeholders — every skill has real summary text
  const summaries = typeof listTopicsWithSummaries === "function" ? listTopicsWithSummaries() : [];
  const placeholders = summaries.filter((t) => t.summary === "(no summary)");
  if (placeholders.length === 0) {
    pass(`All ${summaries.length} skills have summary frontmatter`);
  } else {
    fail(
      "Some skills have placeholder '(no summary)' in the index",
      placeholders.map((t) => t.key).join(", ")
    );
  }

  // 3. Inlined sections for the three always-inline skills
  for (const k of ["elicitation", "wireframes", "report-design"]) {
    const marker = `## Inlined: ${k}.md`;
    const idx = banner.indexOf(marker);
    if (idx < 0) {
      fail(`Missing inlined section for ${k}`);
      continue;
    }
    // Sanity: substantial body content follows (at least 500 chars before EOF)
    const tail = banner.slice(idx);
    if (tail.length < 500) {
      fail(`Inlined section for ${k} looks truncated`, `only ${tail.length} chars after marker`);
    } else {
      pass(`Inlined section for ${k} present (${tail.length} chars)`);
    }
  }

  // 4. Priority ordering at the top of the index
  const priority = ["elicitation", "wireframes", "report-design", "visuals", "formatting"];
  const positions = priority.map((k) => banner.indexOf(`- **${k}**`));
  const ordered =
    positions.every((p) => p >= 0) &&
    positions.every((p, i) => i === 0 || p > positions[i - 1]);
  if (ordered) {
    pass(`Priority order ${priority.join(" < ")} preserved`);
  } else {
    fail(
      "Priority order broken",
      priority.map((k, i) => `${k}@${positions[i]}`).join("  ")
    );
  }

  if (process.exitCode) {
    console.error("");
    console.error("Skills-index smoke test FAILED.");
  } else {
    console.log("");
    console.log("Skills-index smoke test passed.");
  }
}

main();
