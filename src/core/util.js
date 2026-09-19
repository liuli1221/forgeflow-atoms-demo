/**
 * Small shared helpers. Pure, DOM-free, importable from both the browser and
 * `node --test`.
 */

/** Deterministic-ish unique id. Not cryptographic, just unique enough. */
let counter = 0;
export function uid(prefix = 'id') {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** Escape a string for safe insertion into HTML text/attribute context. */
export function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serialize a value into a JS source literal that can never break out of a
 * <script> block. Used by the generator so that user prompt text is embedded
 * as *data*, never as executable source.
 */
export function toSafeJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** ascii-safe identifier-ish key from arbitrary text. */
export function slugKey(text, fallback = 'field') {
  const ascii = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (ascii && /^[a-z]/.test(ascii)) return ascii.slice(0, 32);
  if (ascii) return ('f_' + ascii).slice(0, 32);
  // Non-latin input (e.g. Chinese): derive a stable key from a simple hash.
  const str = String(text ?? '');
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return `${fallback}_${h.toString(36)}`;
}

export function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function uniqueBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
