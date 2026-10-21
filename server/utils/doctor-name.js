/** Format a display name without changing the stored clinical identity. */
export function doctorDisplayName(value) {
  const name = String(value ?? '').trim()
    .replace(/^(?:(?:dr\.|dr(?=\s)|doctor(?=\s))\s*)+/i, '').trim();
  return name ? `Dr. ${name}` : '';
}

/** Templates historically include a title; callers may also supply one. */
export function renderNotificationTemplate(template, variables = {}) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const val = key === 'doctorName' ? doctorDisplayName(value) : String(value ?? '');
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = key === 'doctorName'
      ? /(?:Dr\.?\s+)?{{doctorName}}/gi
      : new RegExp(`{{${escapedKey}}}`, 'g');
    // A replacement callback preserves literal dollar signs in people's names.
    result = result.replace(pattern, () => val);
  }
  return result;
}
