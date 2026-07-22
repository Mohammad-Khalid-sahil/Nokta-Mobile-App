import crypto from 'crypto';
import { SessionToken } from '../models/SessionToken';

export interface SessionContext {
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  deviceName?: string;
}

export class SessionService {
  hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  generateOpaqueToken(size = 32) {
    return crypto.randomBytes(size).toString('hex');
  }

  async createRefreshSession(params: {
    userId: string;
    sessionId: string;
    rawToken: string;
    expiresAt: Date;
    context?: SessionContext;
  }) {
    return SessionToken.create({
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

  async findValidSessionByToken(rawToken: string, tokenType: 'refresh' | 'password_reset' | 'email_verification' | 'phone_verification') {
    return SessionToken.findOne({
      tokenHash: this.hashToken(rawToken),
      tokenType,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      isDeleted: false
    });
  }

  async rotateRefreshSession(params: {
    currentToken: string;
    nextSessionId: string;
    nextRawToken: string;
    nextExpiresAt: Date;
    context?: SessionContext;
  }) {
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

  async revokeSessionByToken(rawToken: string, tokenType: 'refresh' | 'password_reset' | 'email_verification' | 'phone_verification', revokedBy?: string, reason = 'manual_logout') {
    return SessionToken.findOneAndUpdate(
      {
        tokenHash: this.hashToken(rawToken),
        tokenType,
        revokedAt: null
      },
      {
        revokedAt: new Date(),
        revokedBy: revokedBy ?? null,
        reason,
        lastUsedAt: new Date()
      },
      { new: true }
    );
  }

  async revokeAllUserSessions(userId: string, reason = 'logout_all', revokedBy?: string) {
    return SessionToken.updateMany(
      {
        userId,
        tokenType: 'refresh',
        revokedAt: null
      },
      {
        $set: {
          revokedAt: new Date(),
          revokedBy: revokedBy ?? null,
          reason
        }
      }
    );
  }

  async blacklistAccessToken(params: {
    userId: string;
    sessionId: string;
    token: string;
    expiresAt: Date;
    context?: SessionContext;
    reason?: string;
  }) {
    return SessionToken.create({
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

  async isAccessTokenBlacklisted(sessionId: string) {
    const blacklisted = await SessionToken.exists({
      sessionId,
      tokenType: 'access_blacklist',
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      isDeleted: false
    });

    return Boolean(blacklisted);
  }

  async createOneTimeToken(params: {
    userId: string;
    tokenType: 'password_reset' | 'email_verification' | 'phone_verification';
    expiresAt: Date;
    token?: string;
    metadata?: Record<string, unknown>;
    context?: SessionContext;
  }) {
    const rawToken = params.token ?? this.generateOpaqueToken(params.tokenType === 'phone_verification' ? 3 : 32);
    await SessionToken.create({
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

  async consumeOneTimeToken(rawToken: string, tokenType: 'password_reset' | 'email_verification' | 'phone_verification') {
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
