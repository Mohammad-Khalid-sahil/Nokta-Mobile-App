"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const validate_1 = require("../../middlewares/validate");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const response_1 = require("../../helpers/response");
const auth_1 = require("../../middlewares/auth");
const authService_1 = require("../../services/authService");
const Class_1 = require("../../models/Class");
const Subject_1 = require("../../models/Subject");
const User_1 = require("../../models/User");
const publicRegistrationService_1 = require("../../services/publicRegistrationService");
const paymentProviderService_1 = require("../../services/paymentProviderService");
const inputSecurity_1 = require("../../utils/inputSecurity");
const AuditLog_1 = require("../../models/AuditLog");
const password_1 = require("../../utils/password");
const fieldSchemas_1 = require("../../validators/fieldSchemas");
const router = (0, express_1.Router)();
const authService = new authService_1.AuthService();
const publicRegistrationService = new publicRegistrationService_1.PublicRegistrationService();
function getSafeAuthErrorMessage(error, fallback) {
    if (!(error instanceof Error))
        return fallback;
    const message = String(error.message || '').trim();
    const allowedMessages = new Set([
        'Invalid credentials',
        'Selected role does not match this account',
        'Account is temporarily locked due to failed login attempts',
        'Verification code invalid or expired',
        'Verification code does not match account',
        'Two-factor verification failed'
    ]);
    return allowedMessages.has(message) ? message : fallback;
}
const loginSchema = joi_1.default.object({
    body: joi_1.default.object({
        email: joi_1.default.string().email().required(),
        password: joi_1.default.string().required(),
        role: joi_1.default.string().valid('super_admin', 'admin', 'teacher', 'student', 'parent', 'owner', 'branch_manager', 'family_student', 'accountant', 'librarian').optional()
    })
});
const refreshSchema = joi_1.default.object({
    body: joi_1.default.object({
        refreshToken: joi_1.default.string().required()
    })
});
const loginTwoFactorSchema = joi_1.default.object({
    body: joi_1.default.object({
        email: joi_1.default.string().email().required(),
        code: joi_1.default.string().length(6).required()
    })
});
const logoutSchema = joi_1.default.object({
    body: joi_1.default.object({
        refreshToken: joi_1.default.string().optional()
    })
});
const forgotPasswordSchema = joi_1.default.object({
    body: joi_1.default.object({
        email: joi_1.default.string().email().required()
    })
});
const resetPasswordSchema = joi_1.default.object({
    body: joi_1.default.object({
        token: joi_1.default.string().required(),
        newPassword: joi_1.default.string().required()
    })
});
const phoneRequestSchema = joi_1.default.object({
    body: joi_1.default.object({
        phone: joi_1.default.string().optional()
    })
});
const phoneConfirmSchema = joi_1.default.object({
    body: joi_1.default.object({
        code: joi_1.default.string().required()
    })
});
const tokenConfirmSchema = joi_1.default.object({
    body: joi_1.default.object({
        token: joi_1.default.string().required()
    })
});
const profileUpdateSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: (0, fieldSchemas_1.personNameField)(false),
        email: joi_1.default.string().email().max(160).optional(),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        profileImage: joi_1.default.string().trim().max(500).allow('', null).optional()
    }).min(1)
});
const changePasswordSchema = joi_1.default.object({
    body: joi_1.default.object({
        currentPassword: joi_1.default.string().required(),
        newPassword: joi_1.default.string().min(8).max(64).required()
    })
});
const registrationSelectionSchema = joi_1.default.object({
    classId: joi_1.default.string().hex().length(24).required(),
    subjectId: joi_1.default.string().hex().length(24).required(),
    teacherId: joi_1.default.string().hex().length(24).required()
});
const publicStudentRegistrationSchema = joi_1.default.object({
    firstName: (0, fieldSchemas_1.personNameField)(true),
    lastName: (0, fieldSchemas_1.personNameField)(true),
    email: joi_1.default.string().email().max(160).required(),
    phone: (0, fieldSchemas_1.afghanPhoneField)(true),
    whatsapp: (0, fieldSchemas_1.afghanPhoneField)(false),
    password: joi_1.default.string().min(8).max(64).required(),
    confirmPassword: joi_1.default.string().required(),
    fatherName: (0, fieldSchemas_1.personNameField)(true),
    parentPhone: (0, fieldSchemas_1.afghanPhoneField)(true),
    parentEmail: joi_1.default.string().email().max(160).required(),
    gender: joi_1.default.string().valid('male', 'female', 'other').required(),
    classId: joi_1.default.string().hex().length(24).required(),
    subjectId: joi_1.default.string().hex().length(24).required(),
    teacherId: joi_1.default.string().hex().length(24).required(),
    profileImage: joi_1.default.string().trim().max(500).allow('', null).optional(),
    checkoutToken: joi_1.default.string().trim().allow('', null).optional(),
    paymentReference: joi_1.default.string().trim().max(120).allow('', null).optional(),
    paymentMethod: joi_1.default.string().valid('cash', 'bank_transfer', 'mobile_money', 'card').optional()
});
function getRequestContext(req) {
    return {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? '',
        deviceId: req.get('x-device-id') ?? 'web-browser',
        deviceName: req.get('x-device-name') ?? 'Web Browser'
    };
}
router.post('/login', rateLimiter_1.authLimiter, (0, validate_1.validate)(loginSchema), async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const result = await authService.login(email, password, getRequestContext(req), role);
        if ('twoFactorRequired' in result && result.twoFactorRequired) {
            return res.status(202).json({
                success: true,
                message: 'Two-factor verification required',
                twoFactorRequired: true,
                challenge: result.challenge
            });
        }
        if (!('tokens' in result) || !result.tokens || !result.user) {
            return res.status(401).json((0, response_1.createError)('Login failed'));
        }
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            user: result.user,
            tokens: result.tokens
        });
    }
    catch (error) {
        const message = getSafeAuthErrorMessage(error, 'Login failed');
        return res.status(401).json((0, response_1.createError)(message));
    }
});
router.post('/login/2fa', rateLimiter_1.authLimiter, (0, validate_1.validate)(loginTwoFactorSchema), async (req, res) => {
    try {
        const { email, code } = req.body;
        const result = await authService.verifyLoginTwoFactor(email, code, getRequestContext(req));
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            user: result.user,
            tokens: result.tokens
        });
    }
    catch (error) {
        const message = getSafeAuthErrorMessage(error, 'Two-factor verification failed');
        return res.status(401).json((0, response_1.createError)(message));
    }
});
router.get('/register/options', async (req, res) => {
    try {
        const startedAt = Date.now();
        const classId = String(req.query.classId || '').trim();
        const subjectId = String(req.query.subjectId || '').trim();
        const classFilter = {
            active: true,
            isDeleted: false,
            registrationOpen: { $ne: false },
        };
        const subjectFilter = { activeStatus: true, isDeleted: false };
        if (classId) {
            subjectFilter.$or = [{ classId }, { classIds: classId }];
        }
        const [classes, subjectsRaw] = await Promise.all([
            Class_1.ClassModel.find(classFilter)
                .select('className name classCode branchId feeAmount')
                .sort({ className: 1 })
                .limit(200)
                .lean(),
            Subject_1.Subject.find(subjectFilter)
                .select('title code classId classIds teacher branchId feeAmount')
                .sort({ title: 1 })
                .limit(400)
                .lean(),
        ]);
        const teacherIds = [
            ...new Set(subjectsRaw
                .map((subject) => (subject.teacher ? String(subject.teacher) : ''))
                .filter(Boolean)),
        ];
        const teacherDocs = teacherIds.length
            ? await User_1.User.find({ _id: { $in: teacherIds } }).select('name email').lean()
            : [];
        const teacherById = new Map(teacherDocs.map((teacher) => [String(teacher._id), teacher]));
        const subjects = subjectsRaw.map((subject) => ({
            ...subject,
            teacher: subject.teacher ? teacherById.get(String(subject.teacher)) ?? null : null,
        }));
        const teacherMap = new Map();
        subjects.forEach((subject) => {
            const teacher = subject.teacher;
            if (!teacher)
                return;
            const teacherKey = String(teacher._id);
            const currentTeacher = teacherMap.get(teacherKey);
            if (currentTeacher) {
                currentTeacher.subjectIds = Array.from(new Set([...currentTeacher.subjectIds, String(subject._id)]));
                const classIds = [
                    subject.classId ? String(subject.classId) : '',
                    ...(Array.isArray(subject.classIds) ? subject.classIds.map((id) => String(id)) : [])
                ].filter(Boolean);
                currentTeacher.classIds = Array.from(new Set([...currentTeacher.classIds, ...classIds]));
                return;
            }
            const classIds = [
                subject.classId ? String(subject.classId) : '',
                ...(Array.isArray(subject.classIds) ? subject.classIds.map((id) => String(id)) : [])
            ].filter(Boolean);
            teacherMap.set(teacherKey, {
                _id: String(teacher._id),
                name: teacher.name,
                email: teacher.email,
                subjectIds: [String(subject._id)],
                classIds
            });
        });
        const teachers = Array.from(teacherMap.values())
            .filter((teacher) => {
            if (subjectId) {
                return teacher.subjectIds.some((id) => String(id) === subjectId);
            }
            if (classId) {
                return teacher.classIds.some((id) => String(id) === classId);
            }
            return true;
        })
            .map((teacher) => ({
            _id: teacher._id,
            name: teacher.name,
            email: teacher.email
        }));
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs > 1500) {
            console.warn(`[register/options] slow response ${elapsedMs}ms`);
        }
        return res.json((0, response_1.createResponse)({
            classes: classes.map((klass) => ({
                _id: String(klass._id),
                className: klass.className ?? klass.name,
                classCode: klass.classCode,
                branchId: klass.branchId ?? null,
                feeAmount: Number(klass.feeAmount ?? 0)
            })),
            subjects: subjects.map((subject) => ({
                _id: String(subject._id),
                title: subject.title,
                classId: String(subject.classId ?? subject.classIds?.[0] ?? ''),
                code: subject.code,
                teacherId: subject.teacher?._id ? String(subject.teacher._id) : null,
                feeAmount: Number(subject.feeAmount ?? 0)
            })),
            teachers
        }));
    }
    catch (error) {
        return res.status(500).json((0, response_1.createError)(error?.message || 'Unable to load registration options'));
    }
});
router.post('/register/quote', rateLimiter_1.authLimiter, async (req, res) => {
    try {
        const { error, value } = registrationSelectionSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            return res.status(400).json((0, response_1.createError)(error.details.map((detail) => detail.message).join(', ')));
        }
        const quote = await publicRegistrationService.quote(value);
        return res.json((0, response_1.createResponse)(quote));
    }
    catch (error) {
        return res.status(400).json((0, response_1.createError)(error?.message || 'Unable to calculate registration fee'));
    }
});
router.get('/register/payment-config', rateLimiter_1.authLimiter, async (_req, res) => {
    return res.json((0, response_1.createResponse)(paymentProviderService_1.paymentProviderService.getStatus()));
});
router.post('/register/confirm-payment', rateLimiter_1.authLimiter, async (req, res) => {
    try {
        const schema = registrationSelectionSchema.keys({
            email: joi_1.default.string().email().required(),
            checkoutToken: joi_1.default.string().required(),
            paymentReference: joi_1.default.string().min(6).max(120).required(),
            paymentMethod: joi_1.default.string().max(40).optional()
        });
        const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            return res.status(400).json((0, response_1.createError)(error.details.map((detail) => detail.message).join(', ')));
        }
        const confirmed = await publicRegistrationService.confirmCheckoutPayment(value);
        return res.json((0, response_1.createResponse)(confirmed));
    }
    catch (error) {
        return res.status(400).json((0, response_1.createError)(error?.message || 'Unable to confirm registration payment'));
    }
});
router.post('/register/checkout', rateLimiter_1.authLimiter, async (req, res) => {
    try {
        const schema = registrationSelectionSchema.keys({
            email: joi_1.default.string().email().required()
        });
        const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            return res.status(400).json((0, response_1.createError)(error.details.map((detail) => detail.message).join(', ')));
        }
        const checkout = await publicRegistrationService.createCheckout(value);
        return res.json((0, response_1.createResponse)(checkout));
    }
    catch (error) {
        return res.status(400).json((0, response_1.createError)(error?.message || 'Unable to prepare registration checkout'));
    }
});
router.post('/register/student', rateLimiter_1.authLimiter, async (req, res) => {
    try {
        const { error, value } = publicStudentRegistrationSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            return res.status(400).json((0, response_1.createError)(error.details.map((detail) => detail.message).join(', ')));
        }
        const suspiciousFields = Object.values(value).some((entry) => (0, inputSecurity_1.isSuspiciousInput)(entry));
        if (suspiciousFields) {
            const systemActor = await User_1.User.findOne({ role: { $in: ['system_automation', 'super_admin'] }, isDeleted: false }).select('_id').lean();
            if (systemActor?._id) {
                await AuditLog_1.AuditLog.create({
                    actor: systemActor._id,
                    action: 'SECURITY_VALIDATION_REJECTED',
                    targetType: 'registration',
                    target: (0, inputSecurity_1.sanitizePlainText)(value.email, 160),
                    metadata: { route: '/auth/register/student' },
                    severity: 'warning'
                });
            }
            return res.status(400).json((0, response_1.createError)('Invalid characters detected in registration form'));
        }
        if (value.password !== value.confirmPassword) {
            return res.status(400).json((0, response_1.createError)('Password confirmation does not match'));
        }
        const result = await publicRegistrationService.registerStudent({
            firstName: (0, inputSecurity_1.sanitizePlainText)(value.firstName, 80),
            lastName: (0, inputSecurity_1.sanitizePlainText)(value.lastName, 80),
            email: (0, inputSecurity_1.sanitizePlainText)(value.email, 160).toLowerCase(),
            phone: (0, inputSecurity_1.sanitizePlainText)(value.phone, 40),
            whatsapp: (0, inputSecurity_1.sanitizePlainText)(value.whatsapp, 40),
            password: value.password,
            fatherName: (0, inputSecurity_1.sanitizePlainText)(value.fatherName, 120),
            parentPhone: (0, inputSecurity_1.sanitizePlainText)(value.parentPhone, 40),
            parentEmail: (0, inputSecurity_1.sanitizePlainText)(value.parentEmail, 160).toLowerCase(),
            gender: value.gender,
            classId: value.classId,
            subjectId: value.subjectId,
            teacherId: value.teacherId,
            profileImage: value.profileImage,
            checkoutToken: value.checkoutToken,
            paymentReference: value.paymentReference || `REG-${Date.now()}`,
            paymentMethod: value.paymentMethod
        });
        return res.status(201).json((0, response_1.createResponse)(result, 'Student account registered successfully'));
    }
    catch (error) {
        const message = error?.message || 'Student registration failed';
        if (/email already exists/i.test(message)) {
            return res.status(409).json((0, response_1.createError)(message));
        }
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/refresh', rateLimiter_1.authLimiter, (0, validate_1.validate)(refreshSchema), async (req, res) => {
    try {
        const result = await authService.refresh(req.body.refreshToken, getRequestContext(req));
        return res.json((0, response_1.createResponse)({
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            sessionId: result.tokens.sessionId,
            user: result.user,
            tokens: result.tokens
        }, 'Tokens refreshed'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Refresh failed';
        return res.status(401).json((0, response_1.createError)(message));
    }
});
router.post('/logout', auth_1.authenticate, (0, validate_1.validate)(logoutSchema), async (req, res) => {
    try {
        const accessToken = req.headers.authorization?.split(' ')[1];
        await authService.logout({
            userId: req.user.userId,
            accessToken,
            refreshToken: req.body?.refreshToken,
            sessionId: req.user?.sessionId,
            context: getRequestContext(req)
        });
        return res.json((0, response_1.createResponse)({}, 'Logged out successfully'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Logout failed';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/logout-all', auth_1.authenticate, async (req, res) => {
    try {
        await authService.logoutAll(req.user.userId);
        return res.json((0, response_1.createResponse)({}, 'All sessions revoked successfully'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Logout all failed';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/forgot-password', rateLimiter_1.authLimiter, (0, validate_1.validate)(forgotPasswordSchema), async (req, res) => {
    try {
        const result = await authService.requestPasswordReset(req.body.email, getRequestContext(req));
        return res.json((0, response_1.createResponse)(result, result.message));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to request password reset';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/reset-password', rateLimiter_1.authLimiter, (0, validate_1.validate)(resetPasswordSchema), async (req, res) => {
    try {
        const result = await authService.resetPassword(req.body.token, req.body.newPassword);
        return res.json((0, response_1.createResponse)(result, result.message));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reset password';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/email-verification/request', auth_1.authenticate, async (req, res) => {
    try {
        const result = await authService.requestEmailVerification(req.user.userId, getRequestContext(req));
        return res.json((0, response_1.createResponse)(result, result.message));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create email verification token';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/email-verification/confirm', (0, validate_1.validate)(tokenConfirmSchema), async (req, res) => {
    try {
        const result = await authService.confirmEmailVerification(req.body.token);
        return res.json((0, response_1.createResponse)(result, result.message));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Email verification failed';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/phone-verification/request', auth_1.authenticate, (0, validate_1.validate)(phoneRequestSchema), async (req, res) => {
    try {
        const result = await authService.requestPhoneVerification(req.user.userId, req.body?.phone, getRequestContext(req));
        return res.json((0, response_1.createResponse)(result, result.message));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create phone verification code';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.post('/phone-verification/confirm', (0, validate_1.validate)(phoneConfirmSchema), async (req, res) => {
    try {
        const result = await authService.confirmPhoneVerification(req.body.code);
        return res.json((0, response_1.createResponse)(result, result.message));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Phone verification failed';
        return res.status(400).json((0, response_1.createError)(message));
    }
});
router.get('/profile', auth_1.authenticate, async (req, res) => {
    try {
        const profile = await authService.getProfile(req.user.userId);
        return res.json((0, response_1.createResponse)(profile));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load profile';
        return res.status(404).json((0, response_1.createError)(message));
    }
});
router.put('/profile', auth_1.authenticate, (0, validate_1.validate)(profileUpdateSchema), async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.email) {
            payload.email = String(payload.email).trim().toLowerCase();
            const existing = await User_1.User.findOne({ email: payload.email, _id: { $ne: req.user.userId }, isDeleted: false }).lean();
            if (existing)
                return res.status(409).json((0, response_1.createError)('Email already exists'));
        }
        const user = await User_1.User.findOneAndUpdate({ _id: req.user.userId, isDeleted: false }, payload, { new: true, runValidators: true }).select('-password').lean();
        if (!user)
            return res.status(404).json((0, response_1.createError)('User not found'));
        await AuditLog_1.AuditLog.create({
            actor: req.user.userId,
            branchId: user.branchId ?? null,
            action: 'AUTH_PROFILE_UPDATE',
            target: req.user.userId,
            targetType: 'user',
            severity: 'info',
            metadata: { fields: Object.keys(payload) },
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? ''
        });
        return res.json((0, response_1.createResponse)(await authService.getProfile(req.user.userId), 'Profile updated successfully'));
    }
    catch (error) {
        return res.status(400).json((0, response_1.createError)(error?.message || 'Failed to update profile'));
    }
});
router.post('/profile/change-password', auth_1.authenticate, (0, validate_1.validate)(changePasswordSchema), async (req, res) => {
    try {
        const user = await User_1.User.findOne({ _id: req.user.userId, isDeleted: false }).select('+password +passwordHistory.hash');
        if (!user)
            return res.status(404).json((0, response_1.createError)('User not found'));
        const validPassword = await (0, password_1.comparePassword)(req.body.currentPassword, user.password);
        if (!validPassword)
            return res.status(400).json((0, response_1.createError)('Current password is incorrect'));
        user.password = await (0, password_1.hashPassword)(req.body.newPassword);
        user.mustChangePassword = false;
        await user.save();
        await AuditLog_1.AuditLog.create({
            actor: req.user.userId,
            branchId: user.branchId ?? null,
            action: 'AUTH_PROFILE_PASSWORD_CHANGED',
            target: req.user.userId,
            targetType: 'user',
            severity: 'warning',
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? ''
        });
        return res.json((0, response_1.createResponse)({}, 'Password changed successfully'));
    }
    catch (error) {
        return res.status(400).json((0, response_1.createError)(error?.message || 'Failed to change password'));
    }
});
exports.authRouter = router;
