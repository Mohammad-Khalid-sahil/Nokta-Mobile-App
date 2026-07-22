const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=/gi;
const JS_PROTOCOL_PATTERN = /javascript:/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;

export function sanitizePlainText(value: unknown, maxLength = 5000) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(SCRIPT_PATTERN, '')
    .replace(EVENT_HANDLER_PATTERN, '')
    .replace(JS_PROTOCOL_PATTERN, '')
    .replace(HTML_TAG_PATTERN, '')
    .replace(/[<>]/g, '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeRichText(value: unknown, maxLength = 12000) {
  return sanitizePlainText(value, maxLength);
}

export function isSuspiciousInput(value: unknown) {
  const text = String(value ?? '');
  return SCRIPT_PATTERN.test(text) || EVENT_HANDLER_PATTERN.test(text) || JS_PROTOCOL_PATTERN.test(text);
}
