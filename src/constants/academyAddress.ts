/** Canonical public academy address — single source of truth for defaults. */
export const ACADEMY_ADDRESS = {
  en: 'Afghanistan, Kabul – Khair Khana, First Section',
  fa: 'افغانستان، کابل – حصه اول خیرخانه',
  ps: 'افغانستان، کابل – د خیرخانې لومړۍ حصه'
} as const;

export type AcademyAddressLocale = keyof typeof ACADEMY_ADDRESS;

export function isStaleAcademyAddress(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text) return true;
  const lowered = text.toLowerCase();
  return (
    lowered.includes('tehran') ||
    lowered.includes('iran') ||
    text.includes('تهران') ||
    text.includes('ایران')
  );
}

export function resolveAcademyAddress(address: unknown) {
  const source =
    address && typeof address === 'object' && !Array.isArray(address)
      ? (address as Record<string, unknown>)
      : {};
  return {
    en: isStaleAcademyAddress(source.en) ? ACADEMY_ADDRESS.en : String(source.en).trim(),
    fa: isStaleAcademyAddress(source.fa) ? ACADEMY_ADDRESS.fa : String(source.fa).trim(),
    ps: isStaleAcademyAddress(source.ps) ? ACADEMY_ADDRESS.ps : String(source.ps).trim()
  };
}
