export const validEmail = value => !value || /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(value));
export function validateDeal(data, { creating = false, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) } = {}) {
  if (creating && !String(data.title || '').trim()) return 'Deal title is required';
  if (data.value != null && (!Number.isFinite(Number(data.value)) || Number(data.value) < 0)) return 'Deal value must be zero or greater';
  if (data.probability != null && (!Number.isFinite(Number(data.probability)) || Number(data.probability) < 0 || Number(data.probability) > 100)) return 'Probability must be between 0 and 100';
  if (!validEmail(data.contact_email)) return 'Enter a valid contact email';
  if (data.stage && !['qualification','discovery','proposal','negotiation','contract','won','lost'].includes(data.stage)) return 'Select a valid deal stage';
  if (data.expected_close && !Number.isFinite(Date.parse(data.expected_close))) return 'Enter a valid expected close date';
  if (creating && data.expected_close && !['won','lost'].includes(data.stage) && data.expected_close.slice(0,10) < today) return 'Expected close date cannot be in the past for a new open deal';
  return null;
}

export function marketingRecordReference(path) {
  const match = path.match(/^\/(lists|templates|campaigns|list-members)\/([^/]+)(?:\/|$)/);
  if (!match) return null;
  const id = decodeURIComponent(match[2]);
  if (!/^[1-9]\d*$/.test(id)) throw new Error('Invalid marketing record ID');
  return { kind: match[1], id };
}
