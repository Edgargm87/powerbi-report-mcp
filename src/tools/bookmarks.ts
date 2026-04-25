import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateId } from "../pbir.js";
import type { BookmarkDefinition } from "../pbir.js";
import type { ServerContext } from "../context.js";
import { requireProject } from "../context.js";
import { cachedRead, invalidateScope } from "../helpers/readCache.js";

const BOOKMARK_SCHEMA =
  "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/bookmark/2.0.0/schema.json";

export function registerBookmarkTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: pbir_list_bookmarks
  // ============================================================
  server.tool(
    "pbir_list_bookmarks",
    "List all bookmarks defined in the report.",
    {},
    {"readOnlyHint":true,"openWorldHint":false},
    async () =>
      cachedRead("pbir_list_bookmarks", {}, ["bookmarks"], () => {
        const _g = requireProject(ctx); if (_g) return _g;
        const meta = ctx.project.getBookmarksMetadata();
        const bookmarks = meta.bookmarkOrder.map((id) => {
          try {
            const bm = ctx.project.getBookmark(id);
            return { id, displayName: bm.displayName };
          } catch {
            return { id, displayName: "(unreadable)" };
          }
        });
        return { count: bookmarks.length, bookmarks };
      })
  );

  // ============================================================
  // TOOL: pbir_add_bookmark
  // ============================================================
  server.tool(
    "pbir_add_bookmark",
    "Create a new bookmark. The bookmark is created with an empty exploration state — open Power BI Desktop to capture the current view state into it.",
    {
      displayName: z.string().describe("Display name for the bookmark (shown in the bookmarks panel)"),
      activePageId: z
        .string()
        .optional()
        .describe("Page ID that this bookmark should navigate to when activated"),
    },
    {"openWorldHint":false},
    async ({ displayName, activePageId }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const bookmarkId = generateId();

      const explorationState: Record<string, unknown> = {};
      if (activePageId) {
        explorationState.activeSection = activePageId;
      }

      const bookmark: BookmarkDefinition = {
        $schema: BOOKMARK_SCHEMA,
        name: bookmarkId,
        displayName,
        explorationState,
      };

      ctx.project.saveBookmark(bookmarkId, bookmark);

      const meta = ctx.project.getBookmarksMetadata();
      meta.bookmarkOrder.push(bookmarkId);
      ctx.project.saveBookmarksMetadata(meta);
      invalidateScope("bookmarks");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, bookmarkId, displayName }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_delete_bookmark
  // ============================================================
  server.tool(
    "pbir_delete_bookmark",
    "Delete a bookmark by ID.",
    {
      bookmarkId: z.string().describe("The bookmark ID to delete (from pbir_list_bookmarks)"),
    },
    {"destructiveHint":true,"openWorldHint":false},
    async ({ bookmarkId }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const meta = ctx.project.getBookmarksMetadata();
      const before = meta.bookmarkOrder.length;
      meta.bookmarkOrder = meta.bookmarkOrder.filter((id) => id !== bookmarkId);
      ctx.project.saveBookmarksMetadata(meta);
      invalidateScope("bookmarks");
      ctx.project.deleteBookmark(bookmarkId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, bookmarkId, removed: before - meta.bookmarkOrder.length }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_rename_bookmark
  // ============================================================
  server.tool(
    "pbir_rename_bookmark",
    "Rename an existing bookmark.",
    {
      bookmarkId: z.string().describe("The bookmark ID to rename"),
      displayName: z.string().describe("New display name"),
    },
    {"openWorldHint":false},
    async ({ bookmarkId, displayName }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const bookmark = ctx.project.getBookmark(bookmarkId);
      bookmark.displayName = displayName;
      ctx.project.saveBookmark(bookmarkId, bookmark);
      invalidateScope("bookmarks");
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, bookmarkId, displayName }) },
        ],
      };
    }
  );
}
