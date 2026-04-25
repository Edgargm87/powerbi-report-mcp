/**
 * Build a stable cache key. Object key order matters in JSON.stringify; we
 * sort top-level keys so `{a:1,b:2}` and `{b:2,a:1}` collide.
 */
export declare function makeKey(toolName: string, args: Record<string, unknown>): string;
/**
 * Look up the cached payload. Returns null on miss / expiry. Bumps recency.
 */
export declare function getCached(key: string): unknown | null;
/**
 * Store a payload under `key` with the scopes it depends on. Subsequent
 * `invalidateScope(scope)` calls drop every entry whose scope list contains it.
 *
 * Common scopes:
 *   - "report"           — global report-level data
 *   - "page:<pageId>"    — anything tied to a specific page
 *   - "model"            — semantic-model fields
 *   - "theme"            — report theme JSON
 *   - "bookmarks"        — bookmark catalog
 */
export declare function putCached(key: string, payload: unknown, scopes: ReadonlyArray<string>): void;
/**
 * Invalidate every cached entry that lists `scope` as a dependency.
 * Used by write tools after a successful mutation.
 */
export declare function invalidateScope(scope: string): void;
/**
 * Invalidate everything. Reserved for set_report (project switch).
 */
export declare function invalidateAll(): void;
/**
 * Tag a payload with the cache-hit marker so the LLM can see it was a
 * server-side dedup. The original payload is shallow-cloned to avoid
 * mutating the cached object.
 */
export declare function withHitMarker(payload: unknown): unknown;
/**
 * Wrap a read-tool body. Computes the cache key, returns a cache-hit
 * MCP-shaped result if available, or runs `compute()` and stores its result.
 *
 * `compute()` should return the final JSON-serialisable payload — NOT the
 * MCP `{content:[...]}` envelope. The wrapper handles JSON.stringify and the
 * `_cache:"hit"` marker on hits.
 */
export declare function cachedRead(toolName: string, args: Record<string, unknown>, scopes: ReadonlyArray<string>, compute: () => Promise<unknown> | unknown): Promise<{
    content: Array<{
        type: "text";
        text: string;
    }>;
}>;
