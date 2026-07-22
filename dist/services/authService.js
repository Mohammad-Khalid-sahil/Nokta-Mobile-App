"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const User_1 = require("../models/User");
const Student_1 = require("../models/Student");
const Teacher_1 = require("../models/Teacher");
const Branch_1 = require("../models/Branch");
const auditService_1 = require("./auditService");
const sessionService_1 = require("./sessionService");
const password_1 = require("../utils/password");
const roleHelpers_1 = require("../utils/roleHelpers");
const jwt_1 = require("../utils/jwt");
const integrations_1 = require("../config/integrations");
const emailService_1 = require("./emailService");
const smsService_1 = require("./smsService");
class AuthService {
    constructor() {
        this.sessionService = new sessionService_1.SessionService();
        this.auditService = new auditService_1.AuditService();
    }
    shouldRequireTwoFactor(user) {
        if (process.env.ENABLE_LOGIN_2FA !== 'true') {
            return false;
        }
        const canonicalRole = (0, roleHelpers_1.normalizeRole)(user.role) ?? user.role;
        return ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(canonicalRole);
    }
    shouldRequireTwoFactorForRole(role) {
        if (process.env.ENABLE_LOGIN_2FA !== 'true') {
            return false;
        }
        const canonicalRole = (0, roleHelpers_1.normalizeRole)(role) ?? role;
        return ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(canonicalRole);
    }
    loginRoleMatches(actualRole, preferredRole) {
        if (!preferredRole)
            return true;
        const actual = (0, roleHelpers_1.normalizeRole)(actualRole) ?? actualRole;
        const preferred = (0, roleHelpers_1.normalizeRole)(preferredRole) ?? preferredRole;
        if (preferred === 'admin') {
            return ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant', 'librarian'].includes(actual);
        }
        return actual === preferred;
    }
    maskPhone(phone) {
        const safePhone = String(phone || '').trim();
        if (!safePhone) {
            return '';
        }
        if (safePhone.length <= 4) {
            return `${'*'.repeat(Math.max(0, safePhone.length - 1))}${safePhone.slice(-1)}`;
        }
        return `${safePhone.slice(0, 3)}${'*'.repeat(Math.max(0, safePhone.length - 5))}${safePhone.slice(-2)}`;
    }
    serializeUser(user) {
        const legacyPermissions = user.permissions instanceof Map
            ? Object.fromEntries(user.permissions.entries())
            : user.permissions ?? {};
        const effectivePermissionKeys = (0, roleHelpers_1.collectUserPermissions)(user);
        return {
            id: user._id?.toString?.() ?? user.id,
            name: user.name,
            fullName: user.name,
            username: user.username ?? '',
            email: user.email,
            phone: user.phone ?? '',
            profileImage: user.profileImage ?? '',
            role: (0, roleHelpers_1.normalizeRole)(user.role) ?? user.role,
            originalRole: user.role,
            canonicalRole: (0, roleHelpers_1.normalizeRole)(user.role) ?? user.role,
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
    async recordFailedLogin(user) {
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
    async updateLoginContext(user, context) {
        const devices = Array.isArray(user.loginDevices) ? user.loginDevices : [];
        const deviceId = context?.deviceId ?? 'web-browser';
        const existingDevice = devices.find((item) => item.deviceId === deviceId);
        if (existingDevice) {
            existingDevice.userAgent = context?.userAgent ?? existingDevice.userAgent ?? '';
            existingDevice.ipAddress = context?.ipAddress ?? existingDevice.ipAddress ?? '';
            existingDevice.lastSeenAt = new Date();
        }
        else {
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
    async issueTokens(user, context) {
        const sessionId = crypto_1.default.randomUUID();
        const canonicalRole = (0, roleHelpers_1.normalizeRole)(user.role) ?? user.role;
        const accessToken = (0, jwt_1.createAccessToken)(user, canonicalRole, sessionId);
        const refreshToken = (0, jwt_1.createRefreshToken)(user, canonicalRole, sessionId);
        await this.sessionService.createRefreshSession({
            userId: user._id.toString(),
            sessionId,
            rawToken: refreshToken,
            expiresAt: (0, jwt_1.parseTokenExpiry)(refreshToken),
            context
        });
        return {
            accessToken,
            refreshToken,
            sessionId,
            accessTokenExpiresAt: (0, jwt_1.parseTokenExpiry)(accessToken),
            refreshTokenExpiresAt: (0, jwt_1.parseTokenExpiry)(refreshToken)
        };
    }
    async login(email, password, context, preferredRole) {
        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await User_1.User.findOne({ email: normalizedEmail, isDeleted: { $ne: true } }).select('+password +passwordHistory.hash');
        if (!user) {
            throw new Error('Invalid credentials');
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new Error('Account is temporarily locked due to failed login attempts');
        }
        const validPassword = await (0, password_1.comparePassword)(password, user.password);
        if (!validPassword) {
            await this.recordFailedLogin(user);
            throw new Error('Invalid credentials');
        }
        if (['inactive', 'suspended', 'blocked', 'expired'].includes(user.status)) {
            throw new Error(`Account is ${user.status}`);
        }
        if (((0, roleHelpers_1.normalizeRole)(user.role) ?? user.role) === 'student' && user.studentId) {
            const student = await Student_1.Student.findOne({ studentId: user.studentId, isDeleted: false }).select('accountStatus registrationEndDate').lean();
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
                        Student_1.Student.updateOne({ _id: student._id }, { $set: { accountStatus: 'blocked', blockedAt: new Date(), status: 'inactive' } }),
                        User_1.User.updateOne({ _id: user._id }, { $set: { status: 'blocked', active: false } })
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
                    actualRole: (0, roleHelpers_1.normalizeRole)(effectiveRole) ?? effectiveRole,
                    deviceId: context?.deviceId ?? 'web-browser'
                },
                ipAddress: context?.ipAddress,
                userAgent: context?.userAgent
            });
            throw new Error('Selected role does not match this account');
        }
        if (this.shouldRequireTwoFactorForRole(effectiveRole)) {
            const code = `${crypto_1.default.randomInt(100000, 999999)}`;
            await this.sessionService.createOneTimeToken({
                userId: user._id.toString(),
                tokenType: 'phone_verification',
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                token: code,
                metadata: { purpose: 'login_2fa' },
                context
            });
            const smsResult = await smsService_1.smsService.sendOtp(String(user.phone ?? ''), code, 'login_2fa');
            if (!smsResult.delivered && integrations_1.integrationConfig.strictProduction) {
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
                    codePreview: env_1.config.environment === 'production' ? undefined : code
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
    async verifyLoginTwoFactor(email, code, context) {
        const tokenRecord = await this.sessionService.consumeOneTimeToken(code, 'phone_verification');
        if (!tokenRecord) {
            throw new Error('Verification code invalid or expired');
        }
        const purpose = tokenRecord.metadata?.purpose;
        if (purpose !== 'login_2fa') {
            throw new Error('Verification code is not valid for login');
        }
        const user = await User_1.User.findById(tokenRecord.userId).select('+password');
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
    async getProfile(userId) {
        const user = await User_1.User.findById(userId).lean();
        if (!user || user.isDeleted) {
            throw new Error('User not found');
        }
        const base = this.serializeUser(user);
        const canonicalRole = (0, roleHelpers_1.normalizeRole)(user.role) ?? user.role;
        if (canonicalRole === 'teacher') {
            const teacher = await Teacher_1.TeacherProfile.findOne({
                userId: user._id,
                isDeleted: false
            })
                .select('teacherCode gender active branchId salaryType assignedSubjectIds assignedClassIds')
                .lean();
            let branchName = '';
            if (teacher?.branchId) {
                const branch = await Branch_1.Branch.findById(teacher.branchId)
                    .select('name code')
                    .lean();
                branchName = String(branch?.name ?? '');
            }
            else if (user.branchId) {
                const branch = await Branch_1.Branch.findById(user.branchId)
                    .select('name code')
                    .lean();
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
    async refresh(refreshToken, context) {
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(refreshToken, env_1.config.refreshSecret);
        }
        catch {
            throw new Error('Refresh token invalid');
        }
        const session = await this.sessionService.findValidSessionByToken(refreshToken, 'refresh');
        if (!session) {
            throw new Error('Refresh session invalid');
        }
        const user = await User_1.User.findById(payload.userId).select('+password');
        if (!user || user.isDeleted) {
            throw new Error('User not found');
        }
        const nextSessionId = crypto_1.default.randomUUID();
        const canonicalRole = (0, roleHelpers_1.normalizeRole)(user.role) ?? user.role;
        const nextAccessToken = (0, jwt_1.createAccessToken)(user, canonicalRole, nextSessionId);
        const nextRefreshToken = (0, jwt_1.createRefreshToken)(user, canonicalRole, nextSessionId);
        await this.sessionService.rotateRefreshSession({
            currentToken: refreshToken,
            nextSessionId,
            nextRawToken: nextRefreshToken,
            nextExpiresAt: (0, jwt_1.parseTokenExpiry)(nextRefreshToken),
            context
        });
        await this.updateLoginContext(user, context);
        return {
            user: this.serializeUser(user),
            tokens: {
                accessToken: nextAccessToken,
                refreshToken: nextRefreshToken,
                sessionId: nextSessionId,
                accessTokenExpiresAt: (0, jwt_1.parseTokenExpiry)(nextAccessToken),
                refreshTokenExpiresAt: (0, jwt_1.parseTokenExpiry)(nextRefreshToken)
            }
        };
    }
    async logout(params) {
        if (params.refreshToken) {
            await this.sessionService.revokeSessionByToken(params.refreshToken, 'refresh', params.userId, 'logout');
        }
        if (params.accessToken && params.sessionId) {
            await this.sessionService.blacklistAccessToken({
                userId: params.userId,
                sessionId: params.sessionId,
                token: params.accessToken,
                expiresAt: (0, jwt_1.parseTokenExpiry)(params.accessToken),
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
    async logoutAll(userId) {
        await this.sessionService.revokeAllUserSessions(userId, 'logout_all', userId);
        await this.auditService.recordAction({
            actorId: userId,
            action: 'AUTH_LOGOUT_ALL',
            target: userId,
            targetType: 'user'
        });
    }
    async requestPasswordReset(email, context) {
        const user = await User_1.User.findOne({ email, isDeleted: { $ne: true } }).select('+password +passwordHistory.hash');
        if (!user) {
            return { message: 'If the account exists, a reset workflow has been initiated.' };
        }
        const rawToken = await this.sessionService.createOneTimeToken({
            userId: user._id.toString(),
            tokenType: 'password_reset',
            expiresAt: new Date(Date.now() + env_1.config.passwordResetExpiresMinutes * 60 * 1000),
            context
        });
        await emailService_1.emailService.sendPasswordReset(user.email, rawToken).catch(() => undefined);
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
            resetTokenPreview: env_1.config.environment === 'production' ? undefined : rawToken
        };
    }
    async resetPassword(resetToken, newPassword) {
        const tokenRecord = await this.sessionService.consumeOneTimeToken(resetToken, 'password_reset');
        if (!tokenRecord) {
            throw new Error('Password reset token invalid or expired');
        }
        const user = await User_1.User.findById(tokenRecord.userId).select('+password +passwordHistory.hash');
        if (!user) {
            throw new Error('User not found');
        }
        const passwordHistory = [
            { hash: user.password, changedAt: new Date() },
            ...(Array.isArray(user.passwordHistory) ? user.passwordHistory : [])
        ];
        if (await (0, password_1.isPasswordReused)(newPassword, passwordHistory)) {
            throw new Error('New password must not match a recent password');
        }
        user.password = await (0, password_1.hashPassword)(newPassword);
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
    async requestEmailVerification(userId, context) {
        const user = await User_1.User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        const rawToken = await this.sessionService.createOneTimeToken({
            userId: user._id.toString(),
            tokenType: 'email_verification',
            expiresAt: new Date(Date.now() + env_1.config.emailVerificationExpiresHours * 60 * 60 * 1000),
            context
        });
        await emailService_1.emailService.sendEmailVerification(user.email, rawToken).catch(() => undefined);
        return {
            message: 'Email verification token generated.',
            verificationTokenPreview: env_1.config.environment === 'production' ? undefined : rawToken
        };
    }
    async confirmEmailVerification(token) {
        const tokenRecord = await this.sessionService.consumeOneTimeToken(token, 'email_verification');
        if (!tokenRecord) {
            throw new Error('Email verification token invalid or expired');
        }
        const user = await User_1.User.findById(tokenRecord.userId);
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
    async requestPhoneVerification(userId, phone, context) {
        const user = await User_1.User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        if (phone) {
            user.phone = phone;
            await user.save();
        }
        const code = `${crypto_1.default.randomInt(100000, 999999)}`;
        await this.sessionService.createOneTimeToken({
            userId: user._id.toString(),
            tokenType: 'phone_verification',
            expiresAt: new Date(Date.now() + env_1.config.phoneVerificationExpiresMinutes * 60 * 1000),
            token: code,
            context
        });
        const smsResult = await smsService_1.smsService.sendOtp(String(user.phone ?? phone ?? ''), code, 'phone_verification');
        if (!smsResult.delivered && integrations_1.integrationConfig.strictProduction) {
            throw new Error('Unable to send phone verification code');
        }
        return {
            message: 'Phone verification code generated.',
            verificationCodePreview: env_1.config.environment === 'production' ? undefined : code
        };
    }
    async confirmPhoneVerification(code) {
        const tokenRecord = await this.sessionService.consumeOneTimeToken(code, 'phone_verification');
        if (!tokenRecord) {
            throw new Error('Phone verification code invalid or expired');
        }
        const purpose = tokenRecord.metadata?.purpose;
        if (purpose && purpose !== 'phone_verification') {
            throw new Error('Phone verification code invalid for this operation');
        }
        const user = await User_1.User.findById(tokenRecord.userId);
        if (!user) {
            throw new Error('User not found');
        }
        user.phoneVerifiedAt = new Date();
        await user.save();
        return { message: 'Phone verified successfully.' };
    }
}
exports.AuthService = AuthService;
