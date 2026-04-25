"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// Default Tool Set
//
// The 12 tools loaded at MCP server startup when MCP_TOOLS=all is NOT set.
// All other tools live in the on-demand catalog and are activated via the
// pbir_load_tools meta-tool. The default set is tuned for low schema overhead
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
    "pbir_set_report",
    "pbir_list_pages",
    "pbir_list_visuals",
    "pbir_create_page",
    "pbir_add_visual",
    "pbir_get_visual",
    "pbir_format_visual",
    "pbir_update_visual_bindings",
    "pbir_set_report_theme",
    "pbir_bulk_bind",
    "pbir_model_usage",
    // pbir_reload_report must be in the default set: pbir_load_tools can activate
    // server-side tools mid-session, but most LLM harnesses snapshot the MCP
    // tool catalog at startup, so a lazy-loaded pbir_reload_report can be activated
    // but not invoked. Defaulting it avoids that trap.
    "pbir_reload_report",
    // pbir_lookup_theme_property is lightweight (3 optional string params) and is the
    // source of truth for valid pbir_format_visual / pbir_set_report_theme property names.
    // Keeping it in the default set avoids the "agent guesses property name,
    // PBI silently ignores it" failure mode.
    "pbir_lookup_theme_property",
]);
