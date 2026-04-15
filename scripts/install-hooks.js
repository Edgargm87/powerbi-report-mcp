#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// install-hooks.js — point git at .githooks/
//
// Runs: git config core.hooksPath .githooks
//
// That's it. Git will then use .githooks/pre-commit (checked into the repo)
// instead of the default .git/hooks/ location, so the audit + validator gates
// stay in sync across every clone of the repo.
//
// Usage:  npm run hooks:install
// Uninstall: git config --unset core.hooksPath
// ═══════════════════════════════════════════════════════════════════════════════

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const HOOKS_DIR = path.join(ROOT, ".githooks");
const PRE_COMMIT = path.join(HOOKS_DIR, "pre-commit");

if (!fs.existsSync(HOOKS_DIR)) {
  console.error(`✗ .githooks directory not found at ${HOOKS_DIR}`);
  process.exit(1);
}

if (!fs.existsSync(PRE_COMMIT)) {
  console.error(`✗ .githooks/pre-commit not found — repo may be incomplete`);
  process.exit(1);
}

try {
  execSync("git rev-parse --git-dir", { cwd: ROOT, stdio: "ignore" });
} catch {
  console.error("✗ Not a git repository — run this from inside the checkout.");
  process.exit(1);
}

try {
  execSync("git config core.hooksPath .githooks", { cwd: ROOT, stdio: "inherit" });
} catch (err) {
  console.error("✗ Failed to set core.hooksPath:", err.message);
  process.exit(1);
}

// On unixish filesystems the hook needs to be executable. On Windows git still
// runs it via the shell regardless of the exec bit, so this is a no-op there.
try {
  fs.chmodSync(PRE_COMMIT, 0o755);
} catch {
  // Windows will throw EPERM on chmod — that's fine, git-for-windows doesn't
  // need the exec bit.
}

console.log("");
console.log("✓ Git hooks installed.");
console.log("  core.hooksPath → .githooks");
console.log("");
console.log("  The pre-commit hook now runs:");
console.log("    • npm run audit:strict");
console.log("    • npm run test:wireframe");
console.log("");
console.log("  Skip in emergencies with:  git commit --no-verify");
console.log("  Uninstall with:            git config --unset core.hooksPath");
