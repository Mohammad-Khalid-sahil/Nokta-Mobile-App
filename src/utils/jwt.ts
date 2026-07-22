import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';

/** Registered JWT claims — never set manually when using `expiresIn`. */
const JWT_RESERVED_CLAIMS = new Set(['exp', 'iat', 'nbf', 'aud', 'iss', 'sub', 'jti']);

export type AuthTokenPayload = {
  userId: string;
  role: string;
  canonicalRole?: string;
  branchId?: string | null;
  mustChangePassword?: boolean;
};

export type SignJwtOptions = {
  expiresIn: string | number;
  jwtid?: string;
};

/**
 * Removes standard JWT claims from a payload before re-signing.
 * Spreading `jwt.verify()` output into `jwt.sign()` causes exp/expiresIn conflicts.
 */
export function stripJwtClaims<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const cleaned: Record<string, unknown> = { ...payload };
  for (const key of JWT_RESERVED_CLAIMS) {
    delete cleaned[key];
  }
  return cleaned;
}

/** Single project-wide JWT signer — always uses `expiresIn`, never manual `exp`. */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  options: SignJwtOptions
): string {
  const signOptions: SignOptions = {
    expiresIn: options.expiresIn as SignOptions['expiresIn']
  };
  if (options.jwtid) {
    signOptions.jwtid = options.jwtid;
  }
  return jwt.sign(stripJwtClaims(payload), secret, signOptions);
}

export function parseTokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as JwtPayload | null;
  return new Date((decoded?.exp ?? Math.floor(Date.now() / 1000)) * 1000);
}

type TokenUser = {
  _id: { toString(): string };
  role: string;
  branchId?: { toString(): string } | string | null;
  mustChangePassword?: boolean;
};

function buildAuthPayload(user: TokenUser, canonicalRole: string, includeMustChangePassword: boolean): AuthTokenPayload {
  const branchId =
    user.branchId && typeof user.branchId === 'object' && 'toString' in user.branchId
      ? user.branchId.toString()
      : user.branchId ?? null;

  const payload: AuthTokenPayload = {
    userId: user._id.toString(),
    role: user.role,
    canonicalRole,
    branchId
  };

  if (includeMustChangePassword) {
    payload.mustChangePassword = Boolean(user.mustChangePassword);
  }

  return payload;
}

/** Create an access token for a user (login, register, refresh). */
export function createAccessToken(user: TokenUser, canonicalRole: string, sessionId: string): string {
  return signJwt(buildAuthPayload(user, canonicalRole, true), config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    jwtid: sessionId
  });
}

/** Create a refresh token for a user (login, register, refresh). */
export function createRefreshToken(user: TokenUser, canonicalRole: string, sessionId: string): string {
  return signJwt(buildAuthPayload(user, canonicalRole, false), config.refreshSecret, {
    expiresIn: config.refreshExpiresIn,
    jwtid: sessionId
  });
}

/** @deprecated Use createAccessToken — kept as alias for callers expecting createToken. */
export function createToken(user: TokenUser, canonicalRole: string, sessionId: string): string {
  return createAccessToken(user, canonicalRole, sessionId);
}
