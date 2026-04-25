#!/usr/bin/env node
/**
 * Build the Cowork plugin: bundle the MCP, copy assets + skills, package as .plugin.
 *
 * Inputs (committed):
 *   plugin/                    plugin source (scaffold + 3 native Cowork skills)
 *   src/                       MCP source
 *   schemas/                   bundled theme schema
 *   skills/                    16 MCP skills (loaded via guide())
 *
 * Outputs (gitignored):
 *   cowork-plugin-build/       expanded plugin tree (intermediate)
 *   <pluginName>.plugin        zipped plugin file
 *
 * Usage: npm run plugin:build
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_PLUGIN = path.join(ROOT, "plugin");
const BUILD_DIR = path.join(ROOT, "cowork-plugin-build");
const MCP_DIR = path.join(BUILD_DIR, "mcp");
const SCHEMAS_SRC = path.join(ROOT, "schemas");
const SKILLS_SRC = path.join(ROOT, "skills");

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function step(msg) {
  process.stdout.write(`\n[plugin:build] ${msg}\n`);
}

// 1. Compile + ensure dist/ is fresh
step("Building MCP (tsc)...");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

// 2. Clean intermediate dir
step(`Cleaning ${path.relative(ROOT, BUILD_DIR)}/`);
rmrf(BUILD_DIR);

// 3. Copy plugin scaffold (.claude-plugin, .mcp.json, README, native skills/)
step("Copying plugin source scaffold");
copyDir(SRC_PLUGIN, BUILD_DIR);

// 4. esbuild MCP into single-file bundle
step("Bundling MCP server with esbuild");
const bundlePath = path.join(MCP_DIR, "dist", "helpers", "server.js");
fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
execSync(
  [
    "npx esbuild src/index.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node18",
    `--outfile=${bundlePath.replace(/\\/g, "/")}`,
    '--banner:js="#!/usr/bin/env node"',
    "--external:fsevents",
  ].join(" "),
  { cwd: ROOT, stdio: "inherit" }
);

// 5. Copy schema (1.2MB) — required by lookup_theme_property + audit_theme_compliance
step("Copying theme schema");
const schemaDst = path.join(MCP_DIR, "schemas");
fs.mkdirSync(schemaDst, { recursive: true });
for (const f of fs.readdirSync(SCHEMAS_SRC)) {
  if (f.endsWith(".json")) fs.copyFileSync(path.join(SCHEMAS_SRC, f), path.join(schemaDst, f));
}

// 6. Copy ALL 16 MCP skills (loaded by guide() at runtime)
step("Copying MCP skills");
copyDir(SKILLS_SRC, path.join(MCP_DIR, "skills"));

// 7. Read plugin manifest for version + name
const manifest = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, ".claude-plugin", "plugin.json"), "utf8"));
const outFile = path.join(ROOT, `${manifest.name}-${manifest.version}.plugin`);
rmrf(outFile);

// 8. Zip via PowerShell Compress-Archive (Windows-friendly, no zip binary needed)
step(`Packaging ${path.basename(outFile)}`);
const psCmd = `Compress-Archive -Path "${BUILD_DIR}/*" -DestinationPath "${outFile.replace(/\\/g, "/")}.zip" -Force; Move-Item -Force "${outFile.replace(/\\/g, "/")}.zip" "${outFile.replace(/\\/g, "/")}"`;
execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: "inherit" });

const stat = fs.statSync(outFile);
step(`Done — ${path.relative(ROOT, outFile)} (${(stat.size / 1024).toFixed(1)} KB)`);
process.stdout.write(`\nInstall: drag ${outFile} into Cowork's plugin installer.\n`);
