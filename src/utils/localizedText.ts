export type LocalizedTextMap = {
  en?: string;
  fa?: string;
  ps?: string;
};

export function resolveLocalizedText(value: unknown, lang = 'en'): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const code = String(lang || 'en').split('-')[0];
    const candidates = [record[code], record.en, record.fa, record.ps];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    for (const candidate of Object.values(record)) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return String(value).trim();
}

export function normalizeLocalizedInput(value: unknown): LocalizedTextMap | string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return {
      en: typeof record.en === 'string' ? record.en.trim() : '',
      fa: typeof record.fa === 'string' ? record.fa.trim() : '',
      ps: typeof record.ps === 'string' ? record.ps.trim() : ''
    };
  }
  return '';
}
