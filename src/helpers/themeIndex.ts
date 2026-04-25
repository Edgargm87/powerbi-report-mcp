// ═══════════════════════════════════════════════════════════════════════════════
// Theme Index — cheap typo catcher for pbir_format_visual / pbir_add_visual
//
// Walks the bundled PBI theme schema ONCE at first call and produces a
// per-visual-type index of valid category names → valid property name sets.
// Wildcard ('*') category properties are folded into every visual-type's set
// so common props like background/border show up under any visual.
//
// Used by `validateFormatTypos` to flag misspelled categories and properties
// with a single Levenshtein-based "did you mean" suggestion. ~50ms cold cost,
// fully memoised after the first hit. Way cheaper than the previous runtime
// schema validator (which walked the 1.2MB schema on every format call).
//
// Unknown visualType → no-op (empty index). We don't want to gate writes on
// schema lag — if PBI ships a new visual type before we refresh the bundled
// schema, format calls should still go through.
// ═══════════════════════════════════════════════════════════════════════════════

import { loadSchema, getCategoriesForVisualType } from "./themeSchema.js";

export interface FormatEntry {
  category: string;
  properties?: Record<string, unknown>;
}

export interface FormatTypoIssue {
  category: string;
  prop?: string;
  didYouMean: string;
}

// per-visualType → category → Set<propertyName>
type VisualTypeIndex = Map<string, Map<string, Set<string>>>;

let cachedIndex: VisualTypeIndex | null = null;
let wildcardCategories: Map<string, Set<string>> | null = null;

function buildIndex(): VisualTypeIndex {
  const { schema } = loadSchema();
  const defs = (schema as { definitions?: Record<string, unknown> }).definitions || {};
  const visualTypes: string[] = [];
  for (const k of Object.keys(defs)) {
    if (k.startsWith("visual-")) visualTypes.push(k.slice("visual-".length));
  }

  // First pass — wildcard categories (apply to every visual type)
  const wildcard = new Map<string, Set<string>>();
  const wildcardMap = getCategoriesForVisualType(schema, "*");
  for (const [cat, props] of wildcardMap.entries()) {
    wildcard.set(cat, new Set(Object.keys(props)));
  }
  wildcardCategories = wildcard;

  const index: VisualTypeIndex = new Map();
  for (const vType of visualTypes) {
    if (vType === "*") continue;
    const cats = getCategoriesForVisualType(schema, vType);
    const catMap = new Map<string, Set<string>>();
    // Seed with wildcard cats first, then merge type-specific (type-specific wins on prop set union)
    for (const [cat, props] of wildcard.entries()) {
      catMap.set(cat, new Set(props));
    }
    for (const [cat, props] of cats.entries()) {
      const existing = catMap.get(cat) || new Set<string>();
      for (const p of Object.keys(props)) existing.add(p);
      catMap.set(cat, existing);
    }
    index.set(vType, catMap);
  }
  return index;
}

function getIndex(): VisualTypeIndex {
  if (!cachedIndex) cachedIndex = buildIndex();
  return cachedIndex;
}

// ---------------------------------------------------------------------------
// Levenshtein with cap (same trick as bindingValidation.ts)
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function bestMatch(target: string, candidates: Iterable<string>): string | null {
  const cap = Math.max(2, Math.floor(target.length / 2));
  let best: { name: string; d: number } | null = null;
  const lcTarget = target.toLowerCase();
  for (const c of candidates) {
    const d = levenshtein(lcTarget, c.toLowerCase(), cap);
    if (d <= cap && (!best || d < best.d)) best = { name: c, d };
  }
  return best?.name ?? null;
}

/**
 * Validate format entries against the bundled schema.
 *
 * Returns one issue per misspelled category/property with a single best-guess
 * "did you mean" suggestion. Empty array = clean. Unknown visualType returns
 * empty array (we don't gate writes on schema lag).
 */
export function validateFormatTypos(
  visualType: string,
  entries: ReadonlyArray<FormatEntry>
): FormatTypoIssue[] {
  if (!entries || entries.length === 0) return [];
  const index = getIndex();
  const catMap = index.get(visualType);
  if (!catMap) return []; // unknown visualType → no-op
  const validCats = catMap;
  const issues: FormatTypoIssue[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry.category !== "string") continue;
    const propSet = validCats.get(entry.category);
    if (!propSet) {
      // Category typo
      const guess = bestMatch(entry.category, validCats.keys());
      if (guess) {
        issues.push({ category: entry.category, didYouMean: guess });
      }
      continue;
    }
    // Category valid — check property names
    if (!entry.properties || typeof entry.properties !== "object") continue;
    for (const propName of Object.keys(entry.properties)) {
      if (propSet.has(propName)) continue;
      // Try wildcard category props as fallback (some props are universal)
      const wildcardProps = wildcardCategories?.get(entry.category);
      if (wildcardProps?.has(propName)) continue;
      const guess = bestMatch(propName, propSet);
      if (guess) {
        issues.push({ category: entry.category, prop: propName, didYouMean: guess });
      }
    }
  }
  return issues;
}

/**
 * Test seam — drops the cached index so tests can rebuild after fixture swaps.
 */
export function _resetThemeIndex(): void {
  cachedIndex = null;
  wildcardCategories = null;
}
