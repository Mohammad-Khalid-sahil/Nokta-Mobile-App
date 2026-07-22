import bcrypt from 'bcryptjs';

export const PASSWORD_SALT_ROUNDS = 12;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export interface PasswordHistoryEntry {
  hash: string;
  changedAt: Date;
}

export function assertStrongPassword(password: string) {
  const normalizedPassword = String(password ?? '');
  if (normalizedPassword.length < PASSWORD_MIN_LENGTH || normalizedPassword.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (!/[a-z]/.test(normalizedPassword) || !/[A-Z]/.test(normalizedPassword) || !/\d/.test(normalizedPassword)) {
    throw new Error('Password must include upper-case, lower-case, and numeric characters.');
  }
}

export async function hashPassword(password: string) {
  assertStrongPassword(password);
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function isPasswordReused(password: string, history: Array<PasswordHistoryEntry | null | undefined> = []) {
  for (const item of history) {
    if (item?.hash && await bcrypt.compare(password, item.hash)) {
      return true;
    }
  }

  return false;
}

export function pushPasswordHistory(history: Array<PasswordHistoryEntry | null | undefined> = [], hash: string) {
  return [{ hash, changedAt: new Date() }, ...history.filter(Boolean)].slice(0, 5);
}
