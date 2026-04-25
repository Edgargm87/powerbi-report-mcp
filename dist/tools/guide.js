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
exports.listTopicsWithSummaries = listTopicsWithSummaries;
exports.buildSkillsIndexBanner = buildSkillsIndexBanner;
exports.registerGuideTool = registerGuideTool;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Skills directory — single source of truth for prose knowledge
//
// The MCP runs from `dist/`, so __dirname is `dist/tools` after build, or
// `src/tools` under ts-node. Project root is two levels up in either case.
// `skills/` is a sibling of `src/` and `dist/` at the project root.
// ---------------------------------------------------------------------------
function getSkillsDir() {
    // __dirname = dist/tools (built) or src/tools (ts-node)
    const projectRoot = path.join(__dirname, "..", "..");
    return path.join(projectRoot, "skills");
}
/** Strip leading HTML comments (doc-version + summary) so they don't show in output. */
function stripFrontmatter(md) {
    // Remove any number of leading <!-- ... --> lines plus the blank line after.
    let out = md;
    while (/^<!--[^]*?-->\s*\n/.test(out)) {
        out = out.replace(/^<!--[^]*?-->\s*\n/, "");
    }
    return out;
}
/** Discover all *.md files under skills/. Returns sorted topic keys.
 *  Files starting with `_` are meta (e.g. _overview.md, served as the
 *  pbir-instructions MCP resource) and excluded from the public topic list. */
function listTopics() {
    const dir = getSkillsDir();
    if (!fs.existsSync(dir))
        return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
        .map((f) => f.replace(/\.md$/, ""))
        .sort();
}
/** Read the <!-- summary: ... --> line from a skill file, if present. */
function readSummary(key) {
    const dir = getSkillsDir();
    if (!/^[a-zA-Z0-9_-]+$/.test(key))
        return null;
    const file = path.join(dir, `${key}.md`);
    if (!fs.existsSync(file))
        return null;
    // Only read the first ~8 lines — summary is line 2 by convention.
    const head = fs.readFileSync(file, "utf8").split(/\r?\n/).slice(0, 8).join("\n");
    const m = head.match(/<!--\s*summary:\s*([^]*?)\s*-->/i);
    return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
/**
 * List every topic with its summary line (or "(no summary)" if missing).
 * Priority order puts the skills most needed at session start at the top.
 */
const TOPIC_PRIORITY = [
    "elicitation",
    "wireframes",
    "report-design",
    "visuals",
    "formatting",
    "themes-per-visual",
    "pages",
    "shapes",
    "slicers",
    "filters",
    "calculations",
    "svg-visuals",
    "themes",
    "report",
    "errors",
    "token-usage",
];
function listTopicsWithSummaries() {
    const all = listTopics();
    const rank = new Map(TOPIC_PRIORITY.map((k, i) => [k, i]));
    const sorted = all.slice().sort((a, b) => {
        const ra = rank.has(a) ? rank.get(a) : 1000;
        const rb = rank.has(b) ? rank.get(b) : 1000;
        if (ra !== rb)
            return ra - rb;
        return a.localeCompare(b);
    });
    return sorted.map((key) => ({
        key,
        summary: readSummary(key) ?? "(no summary)",
    }));
}
/**
 * Build a compact session-start banner — just the skills index, no inlined
 * file bodies. Every skill file is accessible via `pbir_guide(topic)`; the banner
 * is only a map, not the territory.
 *
 * Rationale: earlier versions inlined elicitation.md + wireframes.md +
 * report-design.md (~35KB / ~9k tokens) into every session. That bloated
 * the context for sessions that never built visuals, and — worse — surfaced
 * concrete example numbers (e.g. slicer 413x40 in wireframes.md) ahead of
 * the house-default docs (slicers.md), which led the LLM to copy wrong
 * sizes. The banner is now a pure index; skills load on demand.
 */
function buildSkillsIndexBanner() {
    const topics = listTopicsWithSummaries();
    const lines = [];
    lines.push("## Skills index — call `pbir_guide(topic)` for full content");
    lines.push("");
    lines.push("Before placing visuals, read `pbir_guide(\"elicitation\")` for what to ask the user, " +
        "`pbir_guide(\"wireframes\")` for layout geometry, and `pbir_guide(\"report-design\")` for taste. " +
        "Call any other topic below on demand.");
    lines.push("");
    for (const { key, summary } of topics) {
        lines.push(`- **${key}** — ${summary}`);
    }
    return lines.join("\n");
}
/** Read a single skill file. Returns null if not found. */
function readTopic(key) {
    const dir = getSkillsDir();
    // Reject path traversal: only bare alphanumeric + dash + underscore
    if (!/^[a-zA-Z0-9_-]+$/.test(key))
        return null;
    const file = path.join(dir, `${key}.md`);
    if (!fs.existsSync(file))
        return null;
    return stripFrontmatter(fs.readFileSync(file, "utf8"));
}
// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------
function registerGuideTool(server, _ctx) {
    // Description no longer hardcodes the topic list — it drifted from disk
    // when files were added (e.g. errors.md). Discovery is live; topic:'list'
    // returns the current set on demand.
    server.tool("pbir_guide", "Domain knowledge for Power BI report development. Topics discovered live from skills/*.md — call with topic:'list' to enumerate.", {
        topic: zod_1.z
            .string()
            .describe("Topic to get guidance on. Pass 'list' to enumerate available topics from skills/*.md."),
    }, { "readOnlyHint": true, "openWorldHint": false }, async ({ topic }) => {
        const key = topic.toLowerCase().trim().replace(/\s+/g, "-");
        // Live-list mode
        if (!key || key === "list" || key === "topics") {
            const topics = listTopics();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ success: true, topics }, null, 2),
                    },
                ],
            };
        }
        const content = readTopic(key);
        if (!content) {
            const topics = listTopics();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: `Unknown topic: "${topic}". Available topics: ${topics.join(", ")}`,
                        }),
                    },
                ],
            };
        }
        return {
            content: [{ type: "text", text: content }],
        };
    });
}
