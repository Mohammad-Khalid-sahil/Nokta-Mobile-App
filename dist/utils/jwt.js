"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripJwtClaims = stripJwtClaims;
exports.signJwt = signJwt;
exports.parseTokenExpiry = parseTokenExpiry;
exports.createAccessToken = createAccessToken;
exports.createRefreshToken = createRefreshToken;
exports.createToken = createToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
/** Registered JWT claims — never set manually when using `expiresIn`. */
const JWT_RESERVED_CLAIMS = new Set(['exp', 'iat', 'nbf', 'aud', 'iss', 'sub', 'jti']);
/**
 * Removes standard JWT claims from a payload before re-signing.
 * Spreading `jwt.verify()` output into `jwt.sign()` causes exp/expiresIn conflicts.
 */
function stripJwtClaims(payload) {
    const cleaned = { ...payload };
    for (const key of JWT_RESERVED_CLAIMS) {
        delete cleaned[key];
    }
    return cleaned;
}
/** Single project-wide JWT signer — always uses `expiresIn`, never manual `exp`. */
function signJwt(payload, secret, options) {
    const signOptions = {
        expiresIn: options.expiresIn
    };
    if (options.jwtid) {
        signOptions.jwtid = options.jwtid;
    }
    return jsonwebtoken_1.default.sign(stripJwtClaims(payload), secret, signOptions);
}
function parseTokenExpiry(token) {
    const decoded = jsonwebtoken_1.default.decode(token);
    return new Date((decoded?.exp ?? Math.floor(Date.now() / 1000)) * 1000);
}
function buildAuthPayload(user, canonicalRole, includeMustChangePassword) {
    const branchId = user.branchId && typeof user.branchId === 'object' && 'toString' in user.branchId
        ? user.branchId.toString()
        : user.branchId ?? null;
    const payload = {
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
function createAccessToken(user, canonicalRole, sessionId) {
    return signJwt(buildAuthPayload(user, canonicalRole, true), env_1.config.jwtSecret, {
        expiresIn: env_1.config.jwtExpiresIn,
        jwtid: sessionId
    });
}
/** Create a refresh token for a user (login, register, refresh). */
function createRefreshToken(user, canonicalRole, sessionId) {
    return signJwt(buildAuthPayload(user, canonicalRole, false), env_1.config.refreshSecret, {
        expiresIn: env_1.config.refreshExpiresIn,
        jwtid: sessionId
    });
}
/** @deprecated Use createAccessToken — kept as alias for callers expecting createToken. */
function createToken(user, canonicalRole, sessionId) {
    return createAccessToken(user, canonicalRole, sessionId);
}
