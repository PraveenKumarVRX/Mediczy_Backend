/** Free-text boundary protection. This complements object-key masking; it is not a clinical de-identification certificate. */
import { maskPhi } from './phi-masker.js';

const RULES = [
  ['EMAIL', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['AADHAAR', /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g],
  ['PAN', /\b[A-Z]{5}\d{4}[A-Z]\b/gi],
  ['PHONE', /(?<![\w.])(?:\+\d{1,3}[ -]?)?(?:\d[ -]?){10,14}(?![\w.])/g],
  ['IDENTIFIER', /\b(?:UHID|MRN|ABHA|Aadhaar|patient\s+id|policy\s+(?:no|number))\s*[:=#]\s*[A-Z0-9][A-Z0-9/-]{2,48}/gi],
  ['NAME', /\b(?:patient(?:\s+name)?|name)\s*[:=]\s*[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3}\b/g],
  ['DOB', /\b(?:DOB|date of birth)\s*[:=]\s*\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/gi],
];

export function redactPhiText(input, identifiers = []) {
  let text = String(input ?? '');
  // Trusted patient context can supply exact identifiers which cannot be inferred from prose.
  for (const identifier of [...identifiers].filter(v => typeof v === 'string' && v.length >= 3).sort((a, b) => b.length - a.length)) {
    text = text.split(identifier).join('[REDACTED-CONTEXT]');
  }
  for (const [type, pattern] of RULES) text = text.replace(pattern, `[REDACTED-${type}]`);
  return text;
}

function redactContent(value, identifiers) {
  if (typeof value === 'string') {
    // Tool results often contain serialized JSON. Parse it before masking so a
    // numeric phone identifier cannot turn valid JSON into an invalid token.
    if (/^\s*[\[{]/.test(value)) {
      try { return JSON.stringify(redactContent(JSON.parse(value), identifiers)); } catch { /* ordinary prose */ }
    }
    return redactPhiText(value, identifiers);
  }
  if (Array.isArray(value)) return value.map(v => redactContent(v, identifiers));
  if (!value || typeof value !== 'object') return value;
  const result = maskPhi(value);
  for (const [key, child] of Object.entries(result)) {
    // Preserve binary image/audio payloads and protocol discriminators. Their
    // content needs separate media consent; text redaction cannot inspect them.
    if (['image_url', 'input_audio', 'type', 'mime_type', 'format'].includes(key)) continue;
    result[key] = redactContent(child, identifiers);
  }
  return result;
}

export function sanitizeLlmMessages(messages, identifiers = []) {
  return (messages || []).map(message => ({
    ...message,
    ...(message.content !== undefined ? { content: redactContent(message.content, identifiers) } : {}),
    ...(message.tool_calls ? {tool_calls:message.tool_calls.map(tool=>({...tool,...(tool.function?{function:{...tool.function,arguments:redactContent(tool.function.arguments,identifiers)}}:{})}))} : {}),
    ...(message.function_call ? {function_call:{...message.function_call,arguments:redactContent(message.function_call.arguments,identifiers)}} : {}),
  }));
}
