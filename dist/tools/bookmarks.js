"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookmarkTools = registerBookmarkTools;
const zod_1 = require("zod");
const pbir_js_1 = require("../pbir.js");
const BOOKMARK_SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/bookmark/2.0.0/schema.json";
function registerBookmarkTools(server, ctx) {
    // ============================================================
    // TOOL: list_bookmarks
    // ============================================================
    server.tool("list_bookmarks", "List all bookmarks defined in the report.", {}, async () => {
        const meta = ctx.project.getBookmarksMetadata();
        const bookmarks = meta.bookmarkOrder.map((id) => {
            try {
                const bm = ctx.project.getBookmark(id);
                return { id, displayName: bm.displayName };
            }
            catch {
                return { id, displayName: "(unreadable)" };
            }
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ count: bookmarks.length, bookmarks }, null, 2),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: add_bookmark
    // ============================================================
    server.tool("add_bookmark", "Create a new bookmark. The bookmark is created with an empty exploration state — open Power BI Desktop to capture the current view state into it.", {
        displayName: zod_1.z.string().describe("Display name for the bookmark (shown in the bookmarks panel)"),
        activePageId: zod_1.z
            .string()
            .optional()
            .describe("Page ID that this bookmark should navigate to when activated"),
    }, async ({ displayName, activePageId }) => {
        const bookmarkId = (0, pbir_js_1.generateId)();
        const explorationState = {};
        if (activePageId) {
            explorationState.activeSection = activePageId;
        }
        const bookmark = {
            $schema: BOOKMARK_SCHEMA,
            name: bookmarkId,
            displayName,
            explorationState,
        };
        ctx.project.saveBookmark(bookmarkId, bookmark);
        const meta = ctx.project.getBookmarksMetadata();
        meta.bookmarkOrder.push(bookmarkId);
        ctx.project.saveBookmarksMetadata(meta);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, bookmarkId, displayName }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: delete_bookmark
    // ============================================================
    server.tool("delete_bookmark", "Delete a bookmark by ID.", {
        bookmarkId: zod_1.z.string().describe("The bookmark ID to delete (from list_bookmarks)"),
    }, async ({ bookmarkId }) => {
        const meta = ctx.project.getBookmarksMetadata();
        const before = meta.bookmarkOrder.length;
        meta.bookmarkOrder = meta.bookmarkOrder.filter((id) => id !== bookmarkId);
        ctx.project.saveBookmarksMetadata(meta);
        ctx.project.deleteBookmark(bookmarkId);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, bookmarkId, removed: before - meta.bookmarkOrder.length }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: rename_bookmark
    // ============================================================
    server.tool("rename_bookmark", "Rename an existing bookmark.", {
        bookmarkId: zod_1.z.string().describe("The bookmark ID to rename"),
        displayName: zod_1.z.string().describe("New display name"),
    }, async ({ bookmarkId, displayName }) => {
        const bookmark = ctx.project.getBookmark(bookmarkId);
        bookmark.displayName = displayName;
        ctx.project.saveBookmark(bookmarkId, bookmark);
        return {
            content: [
                { type: "text", text: JSON.stringify({ success: true, bookmarkId, displayName }) },
            ],
        };
    });
}
