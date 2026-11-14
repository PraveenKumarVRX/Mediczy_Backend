/**
 * Contract tooling: compare the spec with the routes Express really has, and
 * check real responses against the spec's schemas.
 *
 * validateAgainst() implements the subset of OpenAPI 3.0 schema rules this
 * spec uses — type, nullable, enum, required, properties, items,
 * additionalProperties (object or false), minItems/maxItems, $ref — and nothing
 * more. It is a contract check, not a full JSON Schema engine; formats and
 * patterns are not enforced on responses.
 */

/** Express router -> [{ method, path }] with :param rewritten to {param}. */
export function operationsFromRouter(router, mountPrefix = '') {
  const ops = [];
  for (const layer of router.stack || []) {
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const p of paths) {
      if (typeof p !== 'string') continue;
      const path = `${mountPrefix}${p}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      for (const [method, on] of Object.entries(layer.route.methods)) {
        if (on && method !== '_all') ops.push({ method, path });
      }
    }
  }
  return ops;
}

/**
 * Route declarations read from a route file's source, without importing it
 * (importing pulls in models and the database). Understands
 * router.<method>('<path>', …) and the ['<method>', '<path>', …] tables that
 * employee-insurance.route.js loops over.
 */
export function operationsFromSource(source, mountPrefix = '') {
  const ops = [];
  const add = (method, p) => ops.push({ method: method.toLowerCase(), path: `${mountPrefix}${p === '/' ? '' : p}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}') || mountPrefix });
  for (const m of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) add(m[1], m[2]);
  for (const m of source.matchAll(/\[\s*['"](get|post|put|patch|delete)['"]\s*,\s*['"](\/[^'"]+)['"]/g)) add(m[1], m[2]);
  return ops;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Spec -> [{ method, path }], optionally limited to a path prefix. */
export function operationsFromSpec(spec, prefix = '') {
  const ops = [];
  for (const [path, item] of Object.entries(spec.paths || {})) {
    if (prefix && !path.startsWith(prefix)) continue;
    for (const method of METHODS) if (item[method]) ops.push({ method, path });
  }
  return ops;
}

const key = (o) => `${o.method.toUpperCase()} ${o.path}`;

/** What is documented but not served, and served but not documented. */
export function compareOperations(specOps, routerOps) {
  const served = new Set(routerOps.map(key));
  const documented = new Set(specOps.map(key));
  return {
    documentedNotServed: [...documented].filter((k) => !served.has(k)).sort(),
    servedNotDocumented: [...served].filter((k) => !documented.has(k)).sort(),
  };
}

function resolve(spec, schema) {
  let current = schema;
  const seen = new Set();
  while (current && current.$ref) {
    if (seen.has(current.$ref)) throw new Error(`circular $ref ${current.$ref}`);
    seen.add(current.$ref);
    const parts = current.$ref.replace(/^#\//, '').split('/');
    let target = spec;
    for (const part of parts) target = target?.[part];
    if (!target) throw new Error(`unresolved $ref ${current.$ref}`);
    // A sibling `nullable` next to a $ref widens the referenced schema.
    current = schema.nullable && current === schema ? { ...target, nullable: true } : target;
  }
  return current;
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v);

/** Errors as strings like "$.policies[0].enrolment.mode: expected one of …". */
export function validateAgainst(spec, schema, value, path = '$', errors = []) {
  if (!schema) return errors;
  const s = resolve(spec, schema);
  if (value === null) {
    if (!s.nullable && s.type) errors.push(`${path}: null but not nullable`);
    return errors;
  }
  if (value === undefined) return errors;
  const actual = typeOf(value);
  if (s.type) {
    const ok = s.type === actual || (s.type === 'number' && actual === 'integer');
    if (!ok) { errors.push(`${path}: expected ${s.type}, got ${actual}`); return errors; }
  }
  if (s.enum && !s.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(s.enum)}`);
  if (actual === 'array') {
    if (s.minItems !== undefined && value.length < s.minItems) errors.push(`${path}: fewer than ${s.minItems} items`);
    if (s.maxItems !== undefined && value.length > s.maxItems) errors.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) value.forEach((item, i) => validateAgainst(spec, s.items, item, `${path}[${i}]`, errors));
  }
  if (actual === 'object') {
    for (const req of s.required || []) {
      if (value[req] === undefined) errors.push(`${path}.${req}: required but missing`);
    }
    const props = s.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) validateAgainst(spec, props[k], v, `${path}.${k}`, errors);
      else if (s.additionalProperties === false) errors.push(`${path}.${k}: not allowed`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        validateAgainst(spec, s.additionalProperties, v, `${path}.${k}`, errors);
      }
    }
  }
  return errors;
}

/** The documented response schema for an operation and status, or null. */
export function responseSchema(spec, method, path, status) {
  const operation = spec.paths?.[path]?.[method];
  if (!operation) return null;
  let response = operation.responses?.[String(status)] || operation.responses?.default;
  if (!response) return null;
  if (response.$ref) response = resolve(spec, response);
  return response.content?.['application/json']?.schema || null;
}

/** Validates one real response; returns { documented, errors }. */
export function checkResponse(spec, method, path, status, body) {
  const schema = responseSchema(spec, method, path, status);
  if (!schema) return { documented: false, errors: [`${method.toUpperCase()} ${path} has no documented ${status} response`] };
  return { documented: true, errors: validateAgainst(spec, schema, body) };
}

export default { operationsFromRouter, operationsFromSpec, compareOperations, validateAgainst, responseSchema, checkResponse };
