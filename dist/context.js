"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProject = requireProject;
const mcpResult_js_1 = require("./helpers/mcpResult.js");
/**
 * Gate for handlers that touch ctx.project. Returns null if a report is
 * connected, or a fail() MCPResult if not. Use as the first line of a handler:
 *
 *   const guard = requireProject(ctx);
 *   if (guard) return guard;
 *
 * Without this, the project-Proxy in src/index.ts throws on first property
 * access, which bubbles through safe() as a generic error and skips any
 * tool-specific input validation that would have given the user a cleaner
 * message.
 */
function requireProject(ctx) {
    if (!ctx.getReportPath()) {
        return (0, mcpResult_js_1.fail)("No report connected. Use set_report first.");
    }
    return null;
}
