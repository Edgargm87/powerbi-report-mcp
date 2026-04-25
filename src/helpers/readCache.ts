// ═══════════════════════════════════════════════════════════════════════════════
// Read-call dedup cache
//
// Tiny in-memory LRU keyed by `toolName + JSON.stringify(args)` for the
// frequently-repeated read tools (`list_pages`, `list_visuals`, `get_visual`,
// `get_report`, `get_report_theme`, `list_filters`, `list_bookmarks`,
// `model_usage`).
//
// On hit: return the cached payload with `_cache:"hit"` injected so the LLM
// can pattern-match "I just asked this" and cut a redundant read in the next
// turn. The +10 token hit cost beats a 200-1500 token full re-payload.
//
// Invalidation is scope-based — a write to a page invalidates page-scoped
// reads, not the whole cache. The cache is intentionally tiny (16 entries,
// 30s TTL) — the goal is back-to-back duplicate calls, not long-term memo.
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_ENTRIES = 16;
const TTL_MS = 30_000;

interface Entry {
  key: string;
  payload: unknown;
  scopes: ReadonlyArray<string>;
  expires: number;
}

let lru: Entry[] = []; // most recent first

function purgeExpired(now: number): void {
  lru = lru.filter((e) => e.expires > now);
}

/**
 * Build a stable cache key. Object key order matters in JSON.stringify; we
 * sort top-level keys so `{a:1,b:2}` and `{b:2,a:1}` collide.
 */
export function makeKey(toolName: string, args: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(args).sort()) sorted[k] = args[k];
  return `${toolName}::${JSON.stringify(sorted)}`;
}

/**
 * Look up the cached payload. Returns null on miss / expiry. Bumps recency.
 */
export function getCached(key: string): unknown | null {
  const now = Date.now();
  purgeExpired(now);
  const idx = lru.findIndex((e) => e.key === key);
  if (idx === -1) return null;
  const hit = lru[idx];
  // Bump to front
  lru.splice(idx, 1);
  lru.unshift(hit);
  return hit.payload;
}

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
export function putCached(
  key: string,
  payload: unknown,
  scopes: ReadonlyArray<string>
): void {
  const now = Date.now();
  purgeExpired(now);
  // Drop any existing entry with same key, then unshift.
  lru = lru.filter((e) => e.key !== key);
  lru.unshift({ key, payload, scopes, expires: now + TTL_MS });
  if (lru.length > MAX_ENTRIES) lru.length = MAX_ENTRIES;
}

/**
 * Invalidate every cached entry that lists `scope` as a dependency.
 * Used by write tools after a successful mutation.
 */
export function invalidateScope(scope: string): void {
  lru = lru.filter((e) => !e.scopes.includes(scope));
}

/**
 * Invalidate everything. Reserved for set_report (project switch).
 */
export function invalidateAll(): void {
  lru = [];
}

/**
 * Tag a payload with the cache-hit marker so the LLM can see it was a
 * server-side dedup. The original payload is shallow-cloned to avoid
 * mutating the cached object.
 */
export function withHitMarker(payload: unknown): unknown {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), _cache: "hit" };
  }
  return payload;
}

/**
 * Wrap a read-tool body. Computes the cache key, returns a cache-hit
 * MCP-shaped result if available, or runs `compute()` and stores its result.
 *
 * `compute()` should return the final JSON-serialisable payload — NOT the
 * MCP `{content:[...]}` envelope. The wrapper handles JSON.stringify and the
 * `_cache:"hit"` marker on hits.
 */
export async function cachedRead(
  toolName: string,
  args: Record<string, unknown>,
  scopes: ReadonlyArray<string>,
  compute: () => Promise<unknown> | unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const key = makeKey(toolName, args);
  const hit = getCached(key);
  if (hit !== null) {
    return {
      content: [{ type: "text", text: JSON.stringify(withHitMarker(hit), null, 2) }],
    };
  }
  const fresh = await compute();
  putCached(key, fresh, scopes);
  return {
    content: [{ type: "text", text: JSON.stringify(fresh, null, 2) }],
  };
}

