"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// Theme Index — cheap typo catcher for format_visual / add_visual
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFormatTypos = validateFormatTypos;
exports._resetThemeIndex = _resetThemeIndex;
const themeSchema_js_1 = require("./themeSchema.js");
let cachedIndex = null;
let wildcardCategories = null;
function buildIndex() {
    const { schema } = (0, themeSchema_js_1.loadSchema)();
    const defs = schema.definitions || {};
    const visualTypes = [];
    for (const k of Object.keys(defs)) {
        if (k.startsWith("visual-"))
            visualTypes.push(k.slice("visual-".length));
    }
    // First pass — wildcard categories (apply to every visual type)
    const wildcard = new Map();
    const wildcardMap = (0, themeSchema_js_1.getCategoriesForVisualType)(schema, "*");
    for (const [cat, props] of wildcardMap.entries()) {
        wildcard.set(cat, new Set(Object.keys(props)));
    }
    wildcardCategories = wildcard;
    const index = new Map();
    for (const vType of visualTypes) {
        if (vType === "*")
            continue;
        const cats = (0, themeSchema_js_1.getCategoriesForVisualType)(schema, vType);
        const catMap = new Map();
        // Seed with wildcard cats first, then merge type-specific (type-specific wins on prop set union)
        for (const [cat, props] of wildcard.entries()) {
            catMap.set(cat, new Set(props));
        }
        for (const [cat, props] of cats.entries()) {
            const existing = catMap.get(cat) || new Set();
            for (const p of Object.keys(props))
                existing.add(p);
            catMap.set(cat, existing);
        }
        index.set(vType, catMap);
    }
    return index;
}
function getIndex() {
    if (!cachedIndex)
        cachedIndex = buildIndex();
    return cachedIndex;
}
// ---------------------------------------------------------------------------
// Levenshtein with cap (same trick as bindingValidation.ts)
// ---------------------------------------------------------------------------
function levenshtein(a, b, cap) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    if (Math.abs(a.length - b.length) > cap)
        return cap + 1;
    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++)
        prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin)
                rowMin = curr[j];
        }
        if (rowMin > cap)
            return cap + 1;
        for (let j = 0; j <= b.length; j++)
            prev[j] = curr[j];
    }
    return prev[b.length];
}
function bestMatch(target, candidates) {
    const cap = Math.max(2, Math.floor(target.length / 2));
    let best = null;
    const lcTarget = target.toLowerCase();
    for (const c of candidates) {
        const d = levenshtein(lcTarget, c.toLowerCase(), cap);
        if (d <= cap && (!best || d < best.d))
            best = { name: c, d };
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
function validateFormatTypos(visualType, entries) {
    if (!entries || entries.length === 0)
        return [];
    const index = getIndex();
    const catMap = index.get(visualType);
    if (!catMap)
        return []; // unknown visualType → no-op
    const validCats = catMap;
    const issues = [];
    for (const entry of entries) {
        if (!entry || typeof entry.category !== "string")
            continue;
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
        if (!entry.properties || typeof entry.properties !== "object")
            continue;
        for (const propName of Object.keys(entry.properties)) {
            if (propSet.has(propName))
                continue;
            // Try wildcard category props as fallback (some props are universal)
            const wildcardProps = wildcardCategories?.get(entry.category);
            if (wildcardProps?.has(propName))
                continue;
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
function _resetThemeIndex() {
    cachedIndex = null;
    wildcardCategories = null;
}
