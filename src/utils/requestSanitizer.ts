import { sanitizePlainText } from './inputSecurity';

const mongoOperatorPattern = /^\$/;

function sanitizeString(value: string) {
  return sanitizePlainText(value);
}

export function sanitizePayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePayload(entry)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce((acc, [key, entry]) => {
      if (mongoOperatorPattern.test(key) || key.includes('.')) {
        return acc;
      }

      acc[key] = sanitizePayload(entry);
      return acc;
    }, {} as Record<string, unknown>) as T;
  }

  if (typeof value === 'string') {
    return sanitizeString(value) as T;
  }

  return value;
}

export function redactSensitivePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitivePayload(entry));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce((acc, [key, entry]) => {
      if (['password', 'refreshToken', 'token', 'currentPassword', 'newPassword', 'confirmPassword'].includes(key)) {
        acc[key] = '[REDACTED]';
        return acc;
      }

      acc[key] = redactSensitivePayload(entry);
      return acc;
    }, {} as Record<string, unknown>);
  }

  return value;
}
