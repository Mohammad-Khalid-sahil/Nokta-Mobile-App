"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const SessionToken_1 = require("../models/SessionToken");
class SessionService {
    hashToken(token) {
        return crypto_1.default.createHash('sha256').update(token).digest('hex');
    }
    generateOpaqueToken(size = 32) {
        return crypto_1.default.randomBytes(size).toString('hex');
    }
    async createRefreshSession(params) {
        return SessionToken_1.SessionToken.create({
            userId: params.userId,
            sessionId: params.sessionId,
            tokenHash: this.hashToken(params.rawToken),
            tokenType: 'refresh',
            deviceId: params.context?.deviceId ?? '',
            deviceName: params.context?.deviceName ?? '',
            userAgent: params.context?.userAgent ?? '',
            ipAddress: params.context?.ipAddress ?? '',
            expiresAt: params.expiresAt
        });
    }
    async findValidSessionByToken(rawToken, tokenType) {
        return SessionToken_1.SessionToken.findOne({
            tokenHash: this.hashToken(rawToken),
            tokenType,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
            isDeleted: false
        });
    }
    async rotateRefreshSession(params) {
        const currentSession = await this.findValidSessionByToken(params.currentToken, 'refresh');
        if (!currentSession) {
            return null;
        }
        currentSession.revokedAt = new Date();
        currentSession.replacedBySessionId = params.nextSessionId;
        currentSession.lastUsedAt = new Date();
        await currentSession.save();
        await this.createRefreshSession({
            userId: currentSession.userId.toString(),
            sessionId: params.nextSessionId,
            rawToken: params.nextRawToken,
            expiresAt: params.nextExpiresAt,
            context: params.context
        });
        return currentSession;
    }
    async revokeSessionByToken(rawToken, tokenType, revokedBy, reason = 'manual_logout') {
        return SessionToken_1.SessionToken.findOneAndUpdate({
            tokenHash: this.hashToken(rawToken),
            tokenType,
            revokedAt: null
        }, {
            revokedAt: new Date(),
            revokedBy: revokedBy ?? null,
            reason,
            lastUsedAt: new Date()
        }, { new: true });
    }
    async revokeAllUserSessions(userId, reason = 'logout_all', revokedBy) {
        return SessionToken_1.SessionToken.updateMany({
            userId,
            tokenType: 'refresh',
            revokedAt: null
        }, {
            $set: {
                revokedAt: new Date(),
                revokedBy: revokedBy ?? null,
                reason
            }
        });
    }
    async blacklistAccessToken(params) {
        return SessionToken_1.SessionToken.create({
            userId: params.userId,
            sessionId: params.sessionId,
            tokenHash: this.hashToken(params.token),
            tokenType: 'access_blacklist',
            deviceId: params.context?.deviceId ?? '',
            deviceName: params.context?.deviceName ?? '',
            userAgent: params.context?.userAgent ?? '',
            ipAddress: params.context?.ipAddress ?? '',
            expiresAt: params.expiresAt,
            reason: params.reason ?? 'logout'
        });
    }
    async isAccessTokenBlacklisted(sessionId) {
        const blacklisted = await SessionToken_1.SessionToken.exists({
            sessionId,
            tokenType: 'access_blacklist',
            revokedAt: null,
            expiresAt: { $gt: new Date() },
            isDeleted: false
        });
        return Boolean(blacklisted);
    }
    async createOneTimeToken(params) {
        const rawToken = params.token ?? this.generateOpaqueToken(params.tokenType === 'phone_verification' ? 3 : 32);
        await SessionToken_1.SessionToken.create({
            userId: params.userId,
            sessionId: this.generateOpaqueToken(16),
            tokenHash: this.hashToken(rawToken),
            tokenType: params.tokenType,
            deviceId: params.context?.deviceId ?? '',
            deviceName: params.context?.deviceName ?? '',
            userAgent: params.context?.userAgent ?? '',
            ipAddress: params.context?.ipAddress ?? '',
            expiresAt: params.expiresAt,
            metadata: params.metadata ?? {}
        });
        return rawToken;
    }
    async consumeOneTimeToken(rawToken, tokenType) {
        const token = await this.findValidSessionByToken(rawToken, tokenType);
        if (!token) {
            return null;
        }
        token.revokedAt = new Date();
        token.lastUsedAt = new Date();
        await token.save();
        return token;
    }
}
exports.SessionService = SessionService;
