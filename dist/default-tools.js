"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// Default Tool Set
//
// The 12 tools loaded at MCP server startup when MCP_TOOLS=all is NOT set.
// All other tools live in the on-demand catalog and are activated via the
// load_tools meta-tool. The default set is tuned for low schema overhead
// (~3,500 tokens) while still covering the happy-path workflow:
//   connect → orient → create page → add visuals → format → bind → theme → reload
//
// SINGLE SOURCE OF TRUTH: do not duplicate this list anywhere else. Both
// src/index.ts and scripts/audit-skill-coverage.js import (or parse) this
// file so the default-vs-on-demand split stays consistent across the
// runtime, the docs, and the CI gate.
// ═══════════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TOOLS = void 0;
exports.DEFAULT_TOOLS = new Set([
    "set_report",
    "list_pages",
    "list_visuals",
    "create_page",
    "add_visual",
    "get_visual",
    "format_visual",
    "update_visual_bindings",
    "set_report_theme",
    "bulk_bind",
    "model_usage",
    // reload_report must be in the default set: load_tools can activate
    // server-side tools mid-session, but most LLM harnesses snapshot the MCP
    // tool catalog at startup, so a lazy-loaded reload_report can be activated
    // but not invoked. Defaulting it avoids that trap.
    "reload_report",
]);
