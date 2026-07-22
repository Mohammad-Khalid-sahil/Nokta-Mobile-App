import { sanitizePlainText } from './inputSecurity';

export type AccountStatus = 'active' | 'inactive' | 'blocked';

export function normalizeFullName(input: {
  fullName?: unknown;
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
}) {
  const fullName = sanitizePlainText(input.fullName, 160);
  if (fullName) return fullName;

  const legacyName = sanitizePlainText(input.name, 160);
  if (legacyName) return legacyName;

  const firstName = sanitizePlainText(input.firstName, 80);
  const lastName = sanitizePlainText(input.lastName, 80);
  return `${firstName} ${lastName}`.trim();
}

export function normalizeAccountStatus(value: unknown, fallback: AccountStatus = 'active'): AccountStatus {
  const status = sanitizePlainText(value, 32).toLowerCase();
  if (status === 'inactive') return 'inactive';
  if (status === 'blocked' || status === 'locked' || status === 'suspended') return 'blocked';
  return fallback;
}

export function splitFullName(fullName: string) {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '', name: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '', name: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    name: fullName
  };
}

export function buildUserAccountPayload(input: Record<string, any>) {
  const fullName = normalizeFullName(input);
  const names = splitFullName(fullName);
  const status = normalizeAccountStatus(input.status ?? input.accountStatus, 'active');

  return {
    name: names.name || fullName,
    firstName: sanitizePlainText(input.firstName ?? names.firstName, 80),
    lastName: sanitizePlainText(input.lastName ?? names.lastName, 80),
    email: sanitizePlainText(input.email, 160).toLowerCase(),
    phone: sanitizePlainText(input.phone, 40),
    profileImage: sanitizePlainText(input.profileImage, 500),
    role: sanitizePlainText(input.role, 40),
    branchId: input.branchId ?? null,
    status: status === 'blocked' ? 'blocked' : status === 'inactive' ? 'inactive' : 'active',
    active: status === 'active'
  };
}
