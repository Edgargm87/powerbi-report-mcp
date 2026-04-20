#!/usr/bin/env node
/**
 * refresh-theme-schema.js
 *
 * Fetches the latest Power BI theme JSON schema from the Microsoft samples
 * repo and drops it in schemas/ alongside the current one. Does NOT auto-
 * replace — prints a diff summary and asks the developer to review before
 * committing. The schema rots the moment it's bundled; this script is the
 * intentional refresh path.
 *
 * Usage:
 *   node scripts/refresh-theme-schema.js            # check & download if newer
 *   node scripts/refresh-theme-schema.js --check    # check only, don't download
 *   node scripts/refresh-theme-schema.js --force    # download latest regardless
 *
 * Why not runtime-fetch:
 *   - MCP startup would become network-dependent (offline work breaks)
 *   - Corp environments often block github raw fetches
 *   - Microsoft could rename/move the file → silent breakage on random days
 *   - Deterministic builds need versioned artifacts
 *
 * The Microsoft repo:
 *   https://github.com/microsoft/powerbi-desktop-samples/tree/main/Report%20Theme%20JSON%20Schema
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const SCHEMAS_DIR = path.join(ROOT, "schemas");
const GITHUB_API = "https://api.github.com/repos/microsoft/powerbi-desktop-samples/contents/Report%20Theme%20JSON%20Schema";
const RAW_BASE = "https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const force = args.includes("--force");

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

function findLocalSchemas() {
  if (!fs.existsSync(SCHEMAS_DIR)) return [];
  return fs
    .readdirSync(SCHEMAS_DIR)
    .filter((f) => /^reportThemeSchema-[\d.]+\.json$/.test(f))
    .map((f) => ({
      file: f,
      version: f.match(/reportThemeSchema-([\d.]+)\.json/)[1],
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Remote state
// ---------------------------------------------------------------------------

function httpsGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "powerbi-report-mcp-refresh-schema",
          Accept: opts.accept || "application/vnd.github.v3+json",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpsGet(res.headers.location, opts));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error("timeout after 20s"));
    });
  });
}

async function listRemoteSchemas() {
  const body = await httpsGet(GITHUB_API);
  const entries = JSON.parse(body);
  return entries
    .filter((e) => /^reportThemeSchema-[\d.]+\.json$/.test(e.name))
    .map((e) => ({
      file: e.name,
      version: e.name.match(/reportThemeSchema-([\d.]+)\.json/)[1],
      downloadUrl: e.download_url,
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

// ---------------------------------------------------------------------------
// Diff (what properties changed between two versions)
// ---------------------------------------------------------------------------

function extractVisualProperties(schema) {
  // The schema exposes visualStyles.properties per visualType. Walk every
  // defined visual type and collect the union of its categories → properties.
  const out = new Map(); // visualType → Map(category → Set(property))
  try {
    const vs = schema?.properties?.visualStyles?.properties;
    if (!vs) return out;
    for (const [vt, vtSpec] of Object.entries(vs)) {
      const catMap = new Map();
      const cats = vtSpec?.properties || {};
      for (const [cat, catSpec] of Object.entries(cats)) {
        const props = new Set();
        // Schema wraps per-category arrays → items → properties
        const items = catSpec?.items?.properties || catSpec?.properties || {};
        for (const p of Object.keys(items)) props.add(p);
        catMap.set(cat, props);
      }
      out.set(vt, catMap);
    }
  } catch {
    // Schema shape drifted; caller will report "no diff available"
  }
  return out;
}

function diffSchemas(oldS, newS) {
  const oldMap = extractVisualProperties(oldS);
  const newMap = extractVisualProperties(newS);
  const added = [];
  const removed = [];
  const allTypes = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const vt of allTypes) {
    const oldCats = oldMap.get(vt) || new Map();
    const newCats = newMap.get(vt) || new Map();
    const allCats = new Set([...oldCats.keys(), ...newCats.keys()]);
    for (const cat of allCats) {
      const oldProps = oldCats.get(cat) || new Set();
      const newProps = newCats.get(cat) || new Set();
      for (const p of newProps) {
        if (!oldProps.has(p)) added.push(`${vt}.${cat}.${p}`);
      }
      for (const p of oldProps) {
        if (!newProps.has(p)) removed.push(`${vt}.${cat}.${p}`);
      }
    }
  }
  return { added: added.sort(), removed: removed.sort() };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(SCHEMAS_DIR)) fs.mkdirSync(SCHEMAS_DIR, { recursive: true });

  const local = findLocalSchemas();
  const localLatest = local[0] || null;
  console.log(`Local latest:  ${localLatest ? localLatest.file : "(none)"}`);

  console.log(`Fetching remote index from Microsoft samples repo...`);
  const remote = await listRemoteSchemas();
  if (remote.length === 0) {
    console.error("No remote schemas found. Microsoft may have moved or renamed the folder.");
    process.exit(2);
  }
  const remoteLatest = remote[0];
  console.log(`Remote latest: ${remoteLatest.file}`);

  if (!force && localLatest && compareVersions(remoteLatest.version, localLatest.version) <= 0) {
    console.log(`\n✓ Local schema is up to date (${localLatest.version}).`);
    return;
  }

  if (checkOnly) {
    console.log(`\n⚠ Newer schema available: ${remoteLatest.version}`);
    console.log(`  Run without --check to download it.`);
    process.exit(1);
  }

  console.log(`\nDownloading ${remoteLatest.file} ...`);
  const newBody = await httpsGet(remoteLatest.downloadUrl, {
    accept: "application/json",
  });
  const targetPath = path.join(SCHEMAS_DIR, remoteLatest.file);
  fs.writeFileSync(targetPath, newBody, "utf8");
  console.log(`Wrote ${targetPath}`);

  // Diff summary
  if (localLatest) {
    try {
      const oldS = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, localLatest.file), "utf8"));
      const newS = JSON.parse(newBody);
      const { added, removed } = diffSchemas(oldS, newS);
      console.log("");
      console.log("─".repeat(72));
      console.log(`Diff: ${localLatest.version} → ${remoteLatest.version}`);
      console.log("─".repeat(72));
      console.log(`Properties added:   ${added.length}`);
      console.log(`Properties removed: ${removed.length}`);
      if (added.length > 0 && added.length <= 40) {
        console.log("\nAdded:");
        for (const a of added) console.log(`  + ${a}`);
      } else if (added.length > 40) {
        console.log("\nAdded (first 40):");
        for (const a of added.slice(0, 40)) console.log(`  + ${a}`);
        console.log(`  ... and ${added.length - 40} more`);
      }
      if (removed.length > 0) {
        console.log("\nRemoved:");
        for (const r of removed) console.log(`  - ${r}`);
      }
      console.log("");
      console.log(`Next steps:`);
      console.log(`  1. Review the diff above.`);
      console.log(`  2. If the new version looks good, 'git rm' the old file: ${localLatest.file}`);
      console.log(`     (or keep both for a grace period — the lookup tool uses the newest)`);
      console.log(`  3. Commit: git add schemas/ && git commit -m "chore: refresh theme schema to ${remoteLatest.version}"`);
    } catch (err) {
      console.log(`\n(Could not compute diff: ${err.message})`);
    }
  } else {
    console.log(`\nFirst schema bundled — no previous version to diff against.`);
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(2);
});
