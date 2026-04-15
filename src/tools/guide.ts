import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import type { ServerContext } from "../context.js";

// ---------------------------------------------------------------------------
// Skills directory — single source of truth for prose knowledge
//
// The MCP runs from `dist/`, so __dirname is `dist/tools` after build, or
// `src/tools` under ts-node. Project root is two levels up in either case.
// `skills/` is a sibling of `src/` and `dist/` at the project root.
// ---------------------------------------------------------------------------

function getSkillsDir(): string {
  // __dirname = dist/tools (built) or src/tools (ts-node)
  const projectRoot = path.join(__dirname, "..", "..");
  return path.join(projectRoot, "skills");
}

/** Strip the leading HTML doc-version comment so it doesn't show in output. */
function stripFrontmatter(md: string): string {
  return md.replace(/^<!--[^]*?-->\s*\n/, "");
}

/** Discover all *.md files under skills/. Returns sorted topic keys. */
function listTopics(): string[] {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

/** Read a single skill file. Returns null if not found. */
function readTopic(key: string): string | null {
  const dir = getSkillsDir();
  // Reject path traversal: only bare alphanumeric + dash + underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;
  const file = path.join(dir, `${key}.md`);
  if (!fs.existsSync(file)) return null;
  return stripFrontmatter(fs.readFileSync(file, "utf8"));
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerGuideTool(server: McpServer, _ctx: ServerContext): void {
  // Snapshot topics at registration time for the static description.
  // (Topics are still read live from disk on every call, so editing skills/
  // doesn't require a server restart for the content — only the description.)
  const initialTopics = listTopics();
  const topicList = initialTopics.length > 0 ? initialTopics.join(", ") : "(none — skills/ is empty)";

  server.tool(
    "guide",
    `Domain knowledge for Power BI report development. Returns focused guidance and patterns for a topic, read live from skills/*.md. Available topics: ${topicList}`,
    {
      topic: z
        .string()
        .describe(
          `Topic to get guidance on. Available: ${topicList}. Omit or pass "list" to see the current topic list.`
        ),
    },
    async ({ topic }) => {
      const key = topic.toLowerCase().trim().replace(/\s+/g, "-");

      // Live-list mode
      if (!key || key === "list" || key === "topics") {
        const topics = listTopics();
        return {
          content: [
            {
              type: "text" as const,
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
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: `Unknown topic: "${topic}". Available topics: ${topics.join(", ")}`,
              }),
            },
          ],
        };
      }
      return {
        content: [{ type: "text" as const, text: content }],
      };
    }
  );
}
