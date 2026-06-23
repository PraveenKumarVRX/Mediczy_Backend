/** Pure template macro helpers (no DB). */
export function applyTemplate(templateBody, values = {}) {
  let out = templateBody;
  for (const [key, val] of Object.entries(values)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || '');
  }
  return out.replace(/\{\{[^}]+\}\}/g, '');
}
