import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { TeacherProfile } from '../models/Teacher';
import { Branch } from '../models/Branch';
import { AuditService } from './auditService';
import { SessionService, type SessionContext } from './sessionService';
import { comparePassword, hashPassword, isPasswordReused } from '../utils/password';
import { collectUserPermissions, normalizeRole } from '../utils/roleHelpers';
import { createAccessToken, createRefreshToken, parseTokenExpiry } from '../utils/jwt';
import { integrationConfig } from '../config/integrations';
import { emailService } from './emailService';
import { smsService } from './smsService';

type JwtPayload = {
  userId: string;
  role: string;
  canonicalRole?: string;
  branchId?: string | null;
  mustChangePassword?: boolean;
  sessionId?: string;
  jti?: string;
};

export class AuthService {
  private readonly sessionService = new SessionService();
  private readonly auditService = new AuditService();

  private shouldRequireTwoFactor(user: any) {
    if (process.env.ENABLE_LOGIN_2FA !== 'true') {
      return false;
    }
    const canonicalRole = normalizeRole(user.role) ?? user.role;
    return ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(canonicalRole);
  }

  private shouldRequireTwoFactorForRole(role: string) {
    if (process.env.ENABLE_LOGIN_2FA !== 'true') {
      return false;
    }
    const canonicalRole = normalizeRole(role as any) ?? role;
    return ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(canonicalRole);
  }

  private loginRoleMatches(actualRole: string, preferredRole?: string) {
    if (!preferredRole) return true;
    const actual = normalizeRole(actualRole as any) ?? actualRole;
    const preferred = normalizeRole(preferredRole as any) ?? preferredRole;
    if (preferred === 'admin') {
      return ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant', 'librarian'].includes(actual);
    }
    return actual === preferred;
  }

  private maskPhone(phone?: string) {
    const safePhone = String(phone || '').trim();
    if (!safePhone) {
      return '';
    }
    if (safePhone.length <= 4) {
      return `${'*'.repeat(Math.max(0, safePhone.length - 1))}${safePhone.slice(-1)}`;
    }
    return `${safePhone.slice(0, 3)}${'*'.repeat(Math.max(0, safePhone.length - 5))}${safePhone.slice(-2)}`;
  }

  private serializeUser(user: any) {
    const legacyPermissions = user.permissions instanceof Map
      ? Object.fromEntries(user.permissions.entries())
      : user.permissions ?? {};

    const effectivePermissionKeys = collectUserPermissions(user);

    return {
      id: user._id?.toString?.() ?? user.id,
      name: user.name,
      fullName: user.name,
      username: user.username ?? '',
      email: user.email,
      phone: user.phone ?? '',
      profileImage: user.profileImage ?? '',
      role: normalizeRole(user.role) ?? user.role,
      originalRole: user.role,
      canonicalRole: normalizeRole(user.role) ?? user.role,
      branchId: user.branchId ?? null,
      mustChangePassword: Boolean(user.mustChangePassword),
      status: user.status ?? 'active',
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
      permissions: legacyPermissions,
      permissionKeys: effectivePermissionKeys[0] === '*' ? [] : effectivePermissionKeys,
      directPermissionKeys: Array.isArray(user.permissionKeys) ? user.permissionKeys : [],
      revokedPermissionKeys: Array.isArray(user.revokedPermissionKeys) ? user.revokedPermissionKeys : []
    };
  }

  private async recordFailedLogin(user: any) {
    user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
    const shouldLock = user.failedLoginAttempts >= 5;
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      user.status = 'locked';
    }
    await user.save();
    await this.auditService.recordAction({
      actorId: user._id.toString(),
      branchId: user.branchId?.toString?.() ?? null,
      action: shouldLock ? 'AUTH_LOGIN_BLOCKED' : 'AUTH_LOGIN_FAILED',
      target: user._id.toString(),
      targetType: 'user',
      severity: shouldLock ? 'warning' : 'info'
    });
  }

  private async updateLoginContext(user: any, context?: SessionContext) {
    const devices = Array.isArray(user.loginDevices) ? user.loginDevices : [];
    const deviceId = context?.deviceId ?? 'web-browser';
    const existingDevice = devices.find((item: any) => item.deviceId === deviceId);

    if (existingDevice) {
      existingDevice.userAgent = context?.userAgent ?? existingDevice.userAgent ?? '';
      existingDevice.ipAddress = context?.ipAddress ?? existingDevice.ipAddress ?? '';
      existingDevice.lastSeenAt = new Date();
    } else {
      devices.push({
        deviceId,
        userAgent: context?.userAgent ?? '',
        ipAddress: context?.ipAddress ?? '',
        lastSeenAt: new Date(),
        trusted: false
      });
    }

    user.loginDevices = devices.slice(-10);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    if (!['blocked', 'expired', 'suspended', 'inactive'].includes(user.status)) {
      user.status = user.status === 'pending_verification' ? 'pending_verification' : 'active';
    }
    user.lastLoginAt = new Date();
    user.lastLoginIp = context?.ipAddress ?? '';
    await user.save();
  }

  async issueTokens(user: any, context?: SessionContext) {
    const sessionId = crypto.randomUUID();
    const canonicalRole = normalizeRole(user.role) ?? user.role;
    const accessToken = createAccessToken(user, canonicalRole, sessionId);
    const refreshToken = createRefreshToken(user, canonicalRole, sessionId);

    await this.sessionService.createRefreshSession({
      userId: user._id.toString(),
      sessionId,
      rawToken: refreshToken,
      expiresAt: parseTokenExpiry(refreshToken),
      context
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      accessTokenExpiresAt: parseTokenExpiry(accessToken),
      refreshTokenExpiresAt: parseTokenExpiry(refreshToken)
    };
  }

  async login(email: string, password: string, context?: SessionContext, preferredRole?: string) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail, isDeleted: { $ne: true } }).select('+password +passwordHistory.hash');
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error('Account is temporarily locked due to failed login attempts');
    }

    const validPassword = await comparePassword(password, user.password as string);
    if (!validPassword) {
      await this.recordFailedLogin(user);
      throw new Error('Invalid credentials');
    }

    if (['inactive', 'suspended', 'blocked', 'expired'].includes(user.status)) {
      throw new Error(`Account is ${user.status}`);
    }

    if ((normalizeRole(user.role) ?? user.role) === 'student' && user.studentId) {
      const student = await Student.findOne({ studentId: user.studentId, isDeleted: false }).select('accountStatus registrationEndDate').lean<any>();
      if (student?.accountStatus === 'blocked') {
        user.status = 'blocked';
        user.active = false;
        await user.save();
        throw new Error('Student account is blocked because registration has expired');
      }
      if (student?.registrationEndDate) {
        const blockDate = new Date(student.registrationEndDate);
        blockDate.setDate(blockDate.getDate() + 5);
        if (new Date() > blockDate) {
          await Promise.all([
            Student.updateOne({ _id: student._id }, { $set: { accountStatus: 'blocked', blockedAt: new Date(), status: 'inactive' } }),
            User.updateOne({ _id: user._id }, { $set: { status: 'blocked', active: false } })
          ]);
          throw new Error('Student account is blocked because registration has expired');
        }
      }
    }

    const effectiveRole = String(user.role);
    if (!this.loginRoleMatches(effectiveRole, preferredRole)) {
      await this.auditService.recordAction({
        actorId: user._id.toString(),
        branchId: user.branchId?.toString?.() ?? null,
        action: 'AUTH_LOGIN_ROLE_MISMATCH',
        target: user._id.toString(),
        targetType: 'user',
        severity: 'warning',
        metadata: {
          requestedRole: preferredRole,
          actualRole: normalizeRole(effectiveRole as any) ?? effectiveRole,
          deviceId: context?.deviceId ?? 'web-browser'
        },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent
      });
      throw new Error('Selected role does not match this account');
    }

    if (this.shouldRequireTwoFactorForRole(effectiveRole)) {
      const code = `${crypto.randomInt(100000, 999999)}`;
      await this.sessionService.createOneTimeToken({
        userId: user._id.toString(),
        tokenType: 'phone_verification',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        token: code,
        metadata: { purpose: 'login_2fa' },
        context
      });

      const smsResult = await smsService.sendOtp(String(user.phone ?? ''), code, 'login_2fa');
      if (!smsResult.delivered && integrationConfig.strictProduction) {
        throw new Error('Unable to send login verification code');
      }

      await this.auditService.recordAction({
        actorId: user._id.toString(),
        branchId: user.branchId?.toString?.() ?? null,
        action: 'AUTH_2FA_CHALLENGE_SENT',
        target: user._id.toString(),
        targetType: 'user',
        metadata: { deviceId: context?.deviceId ?? 'web-browser', smsDelivered: smsResult.delivered },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent
      });

      return {
        twoFactorRequired: true,
        challenge: {
          method: 'phone_code',
          expiresInSeconds: 300,
          phoneMasked: this.maskPhone(user.phone),
          codePreview: config.environment === 'production' ? undefined : code
        }
      };
    }

    await this.updateLoginContext(user, context);
    const tokens = await this.issueTokens(user, context);

    await this.auditService.recordAction({
      actorId: user._id.toString(),
      branchId: user.branchId?.toString?.() ?? null,
      action: 'AUTH_LOGIN_SUCCESS',
      target: user._id.toString(),
      targetType: 'user',
      metadata: { deviceId: context?.deviceId ?? 'web-browser' },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    });

    return {
      user: this.serializeUser(user),
      tokens
    };
  }

  async verifyLoginTwoFactor(email: string, code: string, context?: SessionContext) {
    const tokenRecord = await this.sessionService.consumeOneTimeToken(code, 'phone_verification');
    if (!tokenRecord) {
      throw new Error('Verification code invalid or expired');
    }

    const purpose = (tokenRecord.metadata as { purpose?: string } | undefined)?.purpose;
    if (purpose !== 'login_2fa') {
      throw new Error('Verification code is not valid for login');
    }

    const user = await User.findById(tokenRecord.userId).select('+password');
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }

    if (String(user.email).toLowerCase() !== String(email).toLowerCase()) {
      throw new Error('Verification code does not match account');
    }

    if (['inactive', 'suspended', 'blocked', 'expired'].includes(user.status)) {
      throw new Error(`Account is ${user.status}`);
    }

    await this.updateLoginContext(user, context);
    const tokens = await this.issueTokens(user, context);

    await this.auditService.recordAction({
      actorId: user._id.toString(),
      branchId: user.branchId?.toString?.() ?? null,
      action: 'AUTH_2FA_SUCCESS',
      target: user._id.toString(),
      targetType: 'user',
      metadata: { deviceId: context?.deviceId ?? 'web-browser' },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    });

    return {
      user: this.serializeUser(user),
      tokens
    };
  }

  async getProfile(userId: string) {
    const user = await User.findById(userId).lean<Record<string, any>>();
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }

    const base = this.serializeUser(user);
    const canonicalRole = normalizeRole(user.role) ?? user.role;

    if (canonicalRole === 'teacher') {
      const teacher = await TeacherProfile.findOne({
        userId: user._id,
        isDeleted: false
      })
        .select('teacherCode gender active branchId salaryType assignedSubjectIds assignedClassIds')
        .lean<Record<string, any>>();

      let branchName = '';
      if (teacher?.branchId) {
        const branch = await Branch.findById(teacher.branchId)
          .select('name code')
          .lean<Record<string, any>>();
        branchName = String(branch?.name ?? '');
      } else if (user.branchId) {
        const branch = await Branch.findById(user.branchId)
          .select('name code')
          .lean<Record<string, any>>();
        branchName = String(branch?.name ?? '');
      }

      return {
        ...base,
        teacherProfileId: teacher?._id ? String(teacher._id) : '',
        teacherCode: teacher?.teacherCode ?? '',
        gender: teacher?.gender ?? '',
        salaryType: teacher?.salaryType ?? '',
        employmentStatus: teacher?.active === false ? 'inactive' : (user.status ?? 'active'),
        branchName,
        assignedSubjectsCount: Array.isArray(teacher?.assignedSubjectIds)
          ? teacher.assignedSubjectIds.length
          : 0,
        assignedClassesCount: Array.isArray(teacher?.assignedClassIds)
          ? teacher.assignedClassIds.length
          : 0
      };
    }

    return base;
  }

  async refresh(refreshToken: string, context?: SessionContext) {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, config.refreshSecret) as JwtPayload;
    } catch {
      throw new Error('Refresh token invalid');
    }

    const session = await this.sessionService.findValidSessionByToken(refreshToken, 'refresh');
    if (!session) {
      throw new Error('Refresh session invalid');
    }

    const user = await User.findById(payload.userId).select('+password');
    if (!user || user.isDeleted) {
      throw new Error('User not found');
    }

    const nextSessionId = crypto.randomUUID();
    const canonicalRole = normalizeRole(user.role) ?? user.role;
    const nextAccessToken = createAccessToken(user, canonicalRole, nextSessionId);
    const nextRefreshToken = createRefreshToken(user, canonicalRole, nextSessionId);

    await this.sessionService.rotateRefreshSession({
      currentToken: refreshToken,
      nextSessionId,
      nextRawToken: nextRefreshToken,
      nextExpiresAt: parseTokenExpiry(nextRefreshToken),
      context
    });

    await this.updateLoginContext(user, context);

    return {
      user: this.serializeUser(user),
      tokens: {
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        sessionId: nextSessionId,
        accessTokenExpiresAt: parseTokenExpiry(nextAccessToken),
        refreshTokenExpiresAt: parseTokenExpiry(nextRefreshToken)
      }
    };
  }

  async logout(params: {
    userId: string;
    accessToken?: string;
    refreshToken?: string;
    sessionId?: string | null;
    context?: SessionContext;
  }) {
    if (params.refreshToken) {
      await this.sessionService.revokeSessionByToken(params.refreshToken, 'refresh', params.userId, 'logout');
    }

    if (params.accessToken && params.sessionId) {
      await this.sessionService.blacklistAccessToken({
        userId: params.userId,
        sessionId: params.sessionId,
        token: params.accessToken,
        expiresAt: parseTokenExpiry(params.accessToken),
        context: params.context,
        reason: 'logout'
      });
    }

    await this.auditService.recordAction({
      actorId: params.userId,
      action: 'AUTH_LOGOUT',
      target: params.userId,
      targetType: 'user',
      ipAddress: params.context?.ipAddress,
      userAgent: params.context?.userAgent
    });
  }

  async logoutAll(userId: string) {
    await this.sessionService.revokeAllUserSessions(userId, 'logout_all', userId);
    await this.auditService.recordAction({
      actorId: userId,
      action: 'AUTH_LOGOUT_ALL',
      target: userId,
      targetType: 'user'
    });
  }

  async requestPasswordReset(email: string, context?: SessionContext) {
    const user = await User.findOne({ email, isDeleted: { $ne: true } }).select('+password +passwordHistory.hash');
    if (!user) {
      return { message: 'If the account exists, a reset workflow has been initiated.' };
    }

    const rawToken = await this.sessionService.createOneTimeToken({
      userId: user._id.toString(),
      tokenType: 'password_reset',
      expiresAt: new Date(Date.now() + config.passwordResetExpiresMinutes * 60 * 1000),
      context
    });

    await emailService.sendPasswordReset(user.email, rawToken).catch(() => undefined);

    await this.auditService.recordAction({
      actorId: user._id.toString(),
      branchId: user.branchId?.toString?.() ?? null,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      target: user._id.toString(),
      targetType: 'user',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    });

    return {
      message: 'If the account exists, a reset workflow has been initiated.',
      resetTokenPreview: config.environment === 'production' ? undefined : rawToken
    };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const tokenRecord = await this.sessionService.consumeOneTimeToken(resetToken, 'password_reset');
    if (!tokenRecord) {
      throw new Error('Password reset token invalid or expired');
    }

    const user = await User.findById(tokenRecord.userId).select('+password +passwordHistory.hash');
    if (!user) {
      throw new Error('User not found');
    }

    const passwordHistory = [
      { hash: user.password as string, changedAt: new Date() },
      ...(Array.isArray(user.passwordHistory) ? user.passwordHistory : [])
    ];

    if (await isPasswordReused(newPassword, passwordHistory)) {
      throw new Error('New password must not match a recent password');
    }

    user.password = await hashPassword(newPassword);
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.status = 'active';
    await user.save();

    await this.sessionService.revokeAllUserSessions(user._id.toString(), 'password_reset', user._id.toString());

    await this.auditService.recordAction({
      actorId: user._id.toString(),
      branchId: user.branchId?.toString?.() ?? null,
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      target: user._id.toString(),
      targetType: 'user'
    });

    return { message: 'Password reset completed successfully.' };
  }

  async requestEmailVerification(userId: string, context?: SessionContext) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const rawToken = await this.sessionService.createOneTimeToken({
      userId: user._id.toString(),
      tokenType: 'email_verification',
      expiresAt: new Date(Date.now() + config.emailVerificationExpiresHours * 60 * 60 * 1000),
      context
    });

    await emailService.sendEmailVerification(user.email, rawToken).catch(() => undefined);

    return {
      message: 'Email verification token generated.',
      verificationTokenPreview: config.environment === 'production' ? undefined : rawToken
    };
  }

  async confirmEmailVerification(token: string) {
    const tokenRecord = await this.sessionService.consumeOneTimeToken(token, 'email_verification');
    if (!tokenRecord) {
      throw new Error('Email verification token invalid or expired');
    }

    const user = await User.findById(tokenRecord.userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.emailVerifiedAt = new Date();
    if (user.status === 'pending_verification') {
      user.status = 'active';
    }
    await user.save();

    return { message: 'Email verified successfully.' };
  }

  async requestPhoneVerification(userId: string, phone?: string, context?: SessionContext) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (phone) {
      user.phone = phone;
      await user.save();
    }

    const code = `${crypto.randomInt(100000, 999999)}`;
    await this.sessionService.createOneTimeToken({
      userId: user._id.toString(),
      tokenType: 'phone_verification',
      expiresAt: new Date(Date.now() + config.phoneVerificationExpiresMinutes * 60 * 1000),
      token: code,
      context
    });

    const smsResult = await smsService.sendOtp(String(user.phone ?? phone ?? ''), code, 'phone_verification');
    if (!smsResult.delivered && integrationConfig.strictProduction) {
      throw new Error('Unable to send phone verification code');
    }

    return {
      message: 'Phone verification code generated.',
      verificationCodePreview: config.environment === 'production' ? undefined : code
    };
  }

  async confirmPhoneVerification(code: string) {
    const tokenRecord = await this.sessionService.consumeOneTimeToken(code, 'phone_verification');
    if (!tokenRecord) {
      throw new Error('Phone verification code invalid or expired');
    }

    const purpose = (tokenRecord.metadata as { purpose?: string } | undefined)?.purpose;
    if (purpose && purpose !== 'phone_verification') {
      throw new Error('Phone verification code invalid for this operation');
    }

    const user = await User.findById(tokenRecord.userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.phoneVerifiedAt = new Date();
    await user.save();

    return { message: 'Phone verified successfully.' };
  }
}
