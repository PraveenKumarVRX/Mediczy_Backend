/**
 * Response-shape consistency on the endpoints the mobile app reads.
 *
 * The bug this guards against was shipped twice in one day:
 *
 *   GET /api/membership/my/current gained `coverage` and `utilisation`, but
 *   only on the path where the member HAS a plan — the no-plan early return
 *   still answered the old shape, so a planless member got `undefined` for
 *   keys the client had been told to expect. A live smoke test caught it.
 *
 *   GET /api/employee/benefits had the same shape: an individual (non-corporate)
 *   member got `healthCheckups: undefined`, on exactly the Benefits & Plans
 *   screen QA reported as empty.
 *
 * These are source-level invariants rather than request tests: they assert
 * that every `res.json({...})` success path inside a handler declares the same
 * top-level keys. That is precisely the property that broke, and it holds
 * without standing up a database.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

/**
 * Remove comments, leaving string literals intact.
 *
 * Without this a prose comma inside a `//` comment — "Flat, render-ready
 * figures…" sits in one of the very responses checked here — splits as though
 * it were a property separator, and the key after it is reported missing.
 */
function stripComments(source) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i++; continue; }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Top-level keys of an object literal, including shorthand properties.
 *
 * Splitting on depth-1 commas and reading each entry's leading identifier
 * handles `claims` as well as `claims: value`; a colon-only regex silently
 * missed every shorthand property and reported real keys as absent.
 */
function topLevelKeys(objectSource) {
  const body = stripComments(objectSource).trim().replace(/^\{/, '').replace(/\}$/, '');
  const entries = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      entries.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  entries.push(current);

  const keys = new Set();
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed || trimmed.startsWith('...')) continue; // spread contributes unknown keys
    const named = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (named) { keys.add(named[1]); continue; }
    const shorthand = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
    if (shorthand) keys.add(shorthand[1]);
  }
  return keys;
}

/**
 * Read a balanced `{...}` starting at `start`. A lazy regex stops at the first
 * inner closing brace and silently returns a truncated literal, which made an
 * earlier version of this guard report keys as missing that were right there.
 */
function balancedObject(source, start) {
  if (source[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** Every success-path `res.json({...})` object literal inside one handler. */
function successResponses(handlerSource) {
  const literals = [];
  const pattern = /res\.json\(\s*/g;
  for (const match of handlerSource.matchAll(pattern)) {
    // Error paths legitimately differ; they are reached via res.status(4xx|5xx).
    const prefix = handlerSource.slice(Math.max(0, match.index - 40), match.index);
    if (/status\(\s*[45]\d\d\s*\)\s*\.$/.test(prefix)) continue;
    const literal = balancedObject(handlerSource, match.index + match[0].length);
    if (literal) literals.push(literal);
  }
  return literals;
}

/** Extract one route handler's body by its HTTP method and path. */
function handlerSource(file, method, routePath) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const marker = new RegExp(`router\\.${method}\\(\\s*['"]${routePath.replace(/\//g, '\\/')}['"]`);
  const start = src.search(marker);
  if (start === -1) throw new Error(`handler not found: ${method.toUpperCase()} ${routePath} in ${file}`);
  // Up to the next route registration, which is where this handler ends.
  const rest = src.slice(start + 10);
  const nextRoute = rest.search(/\nrouter\.(get|post|put|delete|patch)\(/);
  return rest.slice(0, nextRoute === -1 ? 20000 : nextRoute);
}

const CASES = [
  { file: 'routes/membership.route.js', method: 'get', path: '/my/current', why: 'a member with no plan still needs coverage and utilisation' },
  { file: 'routes/employee-network.route.js', method: 'get', path: '/benefits', why: 'an individual member still needs healthCheckups' },
  { file: 'routes/employee-network.route.js', method: 'get', path: '/claims', why: 'an individual member still needs the corporate keys' },
];

describe('every success path of an endpoint declares the same keys', () => {
  test.each(CASES)('$method $path — $why', ({ file, method, path: routePath }) => {
    const responses = successResponses(handlerSource(file, method, routePath));
    expect(responses.length).toBeGreaterThanOrEqual(2);

    const keySets = responses.map(topLevelKeys);
    const union = new Set(keySets.flatMap((set) => [...set]));

    keySets.forEach((set, index) => {
      const missing = [...union].filter((key) => !set.has(key));
      // A client told to expect a key must get it on every success path —
      // explicitly null or empty is fine, absent is not.
      expect({ response: index, missing }).toEqual({ response: index, missing: [] });
    });
  });
});

describe('the helper itself behaves', () => {
  test('counts only top-level keys', () => {
    expect([...topLevelKeys('{ a: 1, b: { c: 2, d: 3 }, e: 4 }')].sort()).toEqual(['a', 'b', 'e']);
  });

  test('counts shorthand properties too', () => {
    // The main /claims response uses ` claims ` with no colon.
    expect([...topLevelKeys('{ success: true, claims }')].sort()).toEqual(['claims', 'success']);
  });

  test('ignores error responses when collecting success paths', () => {
    const src = `
      if (!x) { return res.status(404).json({ success: false, message: 'no' }); }
      return res.json({ success: true, a: 1, b: 2 });
    `;
    const found = successResponses(src);
    expect(found).toHaveLength(1);
    expect([...topLevelKeys(found[0])].sort()).toEqual(['a', 'b', 'success']);
  });
});

describe('stripComments', () => {
  test('a prose comma in a comment does not become a property separator', () => {
    const src = `{
      a: 1,
      // Flat, render-ready figures for Benefits & Plans, which showed "—"
      b: 2
    }`;
    expect([...topLevelKeys(src)].sort()).toEqual(['a', 'b']);
  });

  test('block comments go too', () => {
    expect([...topLevelKeys('{ a: 1, /* x, y */ b: 2 }')].sort()).toEqual(['a', 'b']);
  });

  test('a // inside a string literal is not treated as a comment', () => {
    expect([...topLevelKeys('{ url: "https://example.com/a", b: 2 }')].sort()).toEqual(['b', 'url']);
  });
});
