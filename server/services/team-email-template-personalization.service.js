const PLACEHOLDER = /{{\s*([A-Za-z][A-Za-z0-9_.-]{0,79})\s*}}/g;
const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function templatePlaceholders(...parts) {
  const keys = new Set();
  for (const part of parts) {
    for (const match of String(part || '').matchAll(PLACEHOLDER)) keys.add(match[1]);
  }
  return [...keys];
}

export function personalizeEmailTemplate({ subject = '', body = '', variables = {} }) {
  const safeVariables = Object.fromEntries(
    Object.entries(variables || {}).map(([key, value]) => [key, String(value ?? '').slice(0, 500)])
  );
  const replaceSubject = (_match, key) => safeVariables[key] ?? `{{${key}}}`;
  const replaceBody = (_match, key) => key in safeVariables ? htmlEscape(safeVariables[key]) : `{{${key}}}`;
  return {
    subject: String(subject).replace(PLACEHOLDER, replaceSubject),
    body: String(body).replace(PLACEHOLDER, replaceBody),
    placeholders: templatePlaceholders(subject, body),
  };
}
