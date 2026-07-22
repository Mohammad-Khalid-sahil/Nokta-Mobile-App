export const AFGHAN_MOBILE_PREFIXES = ['070', '078', '079', '072', '077', '074'] as const;

export const AFGHAN_PHONE_REGEX = /^(070|078|079|072|077|074)\d{7}$/;
export const INTERNATIONAL_PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

/** Letters (Latin + Arabic/Persian), spaces, hyphen, apostrophe — no digits. */
export const PERSON_NAME_REGEX = /^[\p{L}\s'.-]+$/u;

export function isValidAfghanPhone(value?: string | null): boolean {
  const text = String(value ?? '').trim();
  const digits = text.replace(/\D/g, '');
  return AFGHAN_PHONE_REGEX.test(digits) || INTERNATIONAL_PHONE_REGEX.test(text);
}

export function isValidPersonName(value?: string | null): boolean {
  const text = String(value ?? '').trim();
  if (!text || text.length < 2) return false;
  if (/\d/.test(text)) return false;
  return PERSON_NAME_REGEX.test(text);
}

export function sanitizeAfghanPhone(value?: string | null): string {
  let digits = String(value ?? '').replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';

  if (digits[0] !== '0') return '';
  if (digits.length >= 2 && digits[1] !== '7') return digits.slice(0, 1);
  if (digits.length >= 3 && !['0', '2', '4', '7', '8', '9'].includes(digits[2])) {
    return digits.slice(0, 2);
  }

  return digits;
}
