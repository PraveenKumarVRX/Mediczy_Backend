/** Hand-rolled validators: small, dependency-free, and they throw a 422 CollectionError naming the field. */
import { invalid } from './errors.js';

const UID = /^[A-Z0-9]{6}$/;
const BARCODE = /^[A-Za-z0-9._-]{4,64}$/;

export const isUid = (v) => typeof v === 'string' && UID.test(v);
export const isBarcode = (v) => typeof v === 'string' && BARCODE.test(v);

export function str(value, field, { min = 1, max = 200, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw invalid(`${field} is required`, { field });
  }
  if (typeof value !== 'string') throw invalid(`${field} must be a string`, { field });
  const v = value.trim();
  if (v.length < min || v.length > max) throw invalid(`${field} must be ${min}-${max} characters`, { field });
  return v;
}

export function oneOf(value, field, allowed, { optional = false, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    if (optional) return null;
    throw invalid(`${field} is required`, { field, allowed });
  }
  if (!allowed.includes(value)) throw invalid(`${field} must be one of: ${allowed.join(', ')}`, { field, allowed });
  return value;
}

export function int(value, field, { min = 0, max = 2_147_483_647, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw invalid(`${field} is required`, { field });
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${field} must be an integer ${min}-${max}`, { field });
  return n;
}

export function bool(value, field, { optional = true } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw invalid(`${field} is required`, { field });
  }
  if (typeof value !== 'boolean') throw invalid(`${field} must be true or false`, { field });
  return value;
}

export function date(value, field, { optional = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw invalid(`${field} is required`, { field });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw invalid(`${field} must be an ISO date-time`, { field });
  return d;
}

export function uuid(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw invalid(`${field} must be a UUID`, { field });
  }
  return value.toLowerCase();
}

export function ownerUid(value, field = 'uid') {
  if (!isUid(value)) throw invalid(`${field} must be a 6-character uid`, { field });
  return value;
}

/** Keep only listed keys, rejecting anything else: an unknown field is a typo or an attack, never data to store. */
export function exactly(obj, field, allowedKeys) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw invalid(`${field} must be an object`, { field });
  const extra = Object.keys(obj).filter((k) => !allowedKeys.includes(k));
  if (extra.length) throw invalid(`${field} has unexpected fields: ${extra.join(', ')}`, { field, extra });
  return obj;
}

export function body(b) {
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw invalid('Request body must be a JSON object');
  return b;
}
