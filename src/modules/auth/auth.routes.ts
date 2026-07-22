import { Router, type Request } from 'express';
import Joi from 'joi';
import { validate } from '../../middlewares/validate';
import { authLimiter } from '../../middlewares/rateLimiter';
import { createResponse, createError } from '../../helpers/response';
import { authenticate } from '../../middlewares/auth';
import { AuthService } from '../../services/authService';
import { ClassModel } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { User } from '../../models/User';
import { PublicRegistrationService } from '../../services/publicRegistrationService';
import { paymentProviderService } from '../../services/paymentProviderService';
import { isSuspiciousInput, sanitizePlainText } from '../../utils/inputSecurity';
import { AuditLog } from '../../models/AuditLog';
import { comparePassword, hashPassword } from '../../utils/password';
import { afghanPhoneField, personNameField } from '../../validators/fieldSchemas';

const router = Router();
const authService = new AuthService();
const publicRegistrationService = new PublicRegistrationService();

function getSafeAuthErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
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

const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    role: Joi.string().valid('super_admin', 'admin', 'teacher', 'student', 'parent', 'owner', 'branch_manager', 'family_student', 'accountant', 'librarian').optional()
  })
});

const refreshSchema = Joi.object({
  body: Joi.object({
    refreshToken: Joi.string().required()
  })
});

const loginTwoFactorSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().length(6).required()
  })
});

const logoutSchema = Joi.object({
  body: Joi.object({
    refreshToken: Joi.string().optional()
  })
});

const forgotPasswordSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required()
  })
});

const resetPasswordSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().required()
  })
});

const phoneRequestSchema = Joi.object({
  body: Joi.object({
    phone: Joi.string().optional()
  })
});

const phoneConfirmSchema = Joi.object({
  body: Joi.object({
    code: Joi.string().required()
  })
});

const tokenConfirmSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().required()
  })
});

const profileUpdateSchema = Joi.object({
  body: Joi.object({
    name: personNameField(false),
    email: Joi.string().email().max(160).optional(),
    phone: afghanPhoneField(false),
    profileImage: Joi.string().trim().max(500).allow('', null).optional()
  }).min(1)
});

const changePasswordSchema = Joi.object({
  body: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(64).required()
  })
});

const registrationSelectionSchema = Joi.object({
  classId: Joi.string().hex().length(24).required(),
  subjectId: Joi.string().hex().length(24).required(),
  teacherId: Joi.string().hex().length(24).required()
});

const publicStudentRegistrationSchema = Joi.object({
  firstName: personNameField(true),
  lastName: personNameField(true),
  email: Joi.string().email().max(160).required(),
  phone: afghanPhoneField(true),
  nationalId: Joi.string().trim().max(80).allow('', null).optional(),
  whatsapp: afghanPhoneField(false),
  password: Joi.string().min(8).max(64).required(),
  confirmPassword: Joi.string().required(),
  fatherName: personNameField(true),
  parentPhone: afghanPhoneField(true),
  parentEmail: Joi.string().email().max(160).required(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  classId: Joi.string().hex().length(24).required(),
  subjectId: Joi.string().hex().length(24).required(),
  teacherId: Joi.string().hex().length(24).required(),
  profileImage: Joi.string().trim().max(500).allow('', null).optional(),
  checkoutToken: Joi.string().trim().allow('', null).optional(),
  paymentReference: Joi.string().trim().max(120).allow('', null).optional(),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'mobile_money', 'card').optional()
});

function buildRegistrationPaymentReference() {
  const entropy = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `REG-${Date.now()}-${entropy}`;
}

function getRequestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? '',
    deviceId: req.get('x-device-id') ?? 'web-browser',
    deviceName: req.get('x-device-name') ?? 'Web Browser'
  };
}

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
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
      return res.status(401).json(createError('Login failed'));
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user,
      tokens: result.tokens
    });
  } catch (error) {
    const message = getSafeAuthErrorMessage(error, 'Login failed');
    return res.status(401).json(createError(message));
  }
});

router.post('/login/2fa', authLimiter, validate(loginTwoFactorSchema), async (req, res) => {
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
  } catch (error) {
    const message = getSafeAuthErrorMessage(error, 'Two-factor verification failed');
    return res.status(401).json(createError(message));
  }
});

router.get('/register/options', async (req, res) => {
  try {
    const startedAt = Date.now();
    const classId = String(req.query.classId || '').trim();
    const subjectId = String(req.query.subjectId || '').trim();

    const classFilter: Record<string, unknown> = {
      active: true,
      isDeleted: false,
      registrationOpen: { $ne: false },
    };
    const subjectFilter: Record<string, unknown> = { activeStatus: true, isDeleted: false };
    if (classId) {
      subjectFilter.$or = [{ classId }, { classIds: classId }];
    }

    const [classes, subjectsRaw] = await Promise.all([
      ClassModel.find(classFilter)
        .select('className name classCode branchId feeAmount')
        .sort({ className: 1 })
        .limit(200)
        .lean(),
      Subject.find(subjectFilter)
        .select('title code classId classIds teacher branchId feeAmount')
        .sort({ title: 1 })
        .limit(400)
        .lean(),
    ]);

    const teacherIds = [
      ...new Set(
        subjectsRaw
          .map((subject: any) => (subject.teacher ? String(subject.teacher) : ''))
          .filter(Boolean),
      ),
    ];

    const teacherDocs = teacherIds.length
      ? await User.find({ _id: { $in: teacherIds } }).select('name email').lean()
      : [];
    const teacherById = new Map(teacherDocs.map((teacher: any) => [String(teacher._id), teacher]));

    const subjects = subjectsRaw.map((subject: any) => ({
      ...subject,
      teacher: subject.teacher ? teacherById.get(String(subject.teacher)) ?? null : null,
    }));

    const teacherMap = new Map<string, any>();
    subjects.forEach((subject: any) => {
      const teacher = subject.teacher;
      if (!teacher) return;
      const teacherKey = String(teacher._id);
      const currentTeacher = teacherMap.get(teacherKey);
      if (currentTeacher) {
        currentTeacher.subjectIds = Array.from(new Set([...currentTeacher.subjectIds, String(subject._id)]));
        const classIds = [
          subject.classId ? String(subject.classId) : '',
          ...(Array.isArray(subject.classIds) ? subject.classIds.map((id: any) => String(id)) : [])
        ].filter(Boolean);
        currentTeacher.classIds = Array.from(new Set([...currentTeacher.classIds, ...classIds]));
        return;
      }

      const classIds = [
        subject.classId ? String(subject.classId) : '',
        ...(Array.isArray(subject.classIds) ? subject.classIds.map((id: any) => String(id)) : [])
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
      .filter((teacher: any) => {
        if (subjectId) {
          return teacher.subjectIds.some((id: any) => String(id) === subjectId);
        }
        if (classId) {
          return teacher.classIds.some((id: any) => String(id) === classId);
        }
        return true;
      })
      .map((teacher: any) => ({
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email
      }));

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > 1500) {
      console.warn(`[register/options] slow response ${elapsedMs}ms`);
    }

    return res.json(createResponse({
      classes: classes.map((klass: any) => ({
        _id: String(klass._id),
        className: klass.className ?? klass.name,
        classCode: klass.classCode,
        branchId: klass.branchId ?? null,
        feeAmount: Number(klass.feeAmount ?? 0)
      })),
      subjects: subjects.map((subject: any) => ({
        _id: String(subject._id),
        title: subject.title,
        classId: String(subject.classId ?? subject.classIds?.[0] ?? ''),
        code: subject.code,
        teacherId: subject.teacher?._id ? String(subject.teacher._id) : null,
        feeAmount: Number(subject.feeAmount ?? 0)
      })),
      teachers
    }));
  } catch (error: any) {
    return res.status(500).json(createError(error?.message || 'Unable to load registration options'));
  }
});

router.post('/register/quote', authLimiter, async (req, res) => {
  try {
    const { error, value } = registrationSelectionSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json(createError(error.details.map((detail) => detail.message).join(', ')));
    }
    const quote = await publicRegistrationService.quote(value);
    return res.json(createResponse(quote));
  } catch (error: any) {
    return res.status(400).json(createError(error?.message || 'Unable to calculate registration fee'));
  }
});

router.get('/register/payment-config', authLimiter, async (_req, res) => {
  return res.json(createResponse(paymentProviderService.getStatus()));
});

router.post('/register/confirm-payment', authLimiter, async (req, res) => {
  try {
    const schema = registrationSelectionSchema.keys({
      email: Joi.string().email().required(),
      checkoutToken: Joi.string().required(),
      paymentReference: Joi.string().min(6).max(120).optional(),
      paymentMethod: Joi.string().max(40).optional()
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json(createError(error.details.map((detail) => detail.message).join(', ')));
    }
    const paymentReference = value.paymentReference || buildRegistrationPaymentReference();
    const confirmed = await publicRegistrationService.confirmCheckoutPayment({
      ...value,
      paymentReference
    });
    return res.json(createResponse(confirmed));
  } catch (error: any) {
    return res.status(400).json(createError(error?.message || 'Unable to confirm registration payment'));
  }
});

router.post('/register/checkout', authLimiter, async (req, res) => {
  try {
    const schema = registrationSelectionSchema.keys({
      email: Joi.string().email().required()
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json(createError(error.details.map((detail) => detail.message).join(', ')));
    }
    const checkout = await publicRegistrationService.createCheckout(value);
    return res.json(createResponse(checkout));
  } catch (error: any) {
    return res.status(400).json(createError(error?.message || 'Unable to prepare registration checkout'));
  }
});

router.post('/register/student', authLimiter, async (req, res) => {
  try {
    const { error, value } = publicStudentRegistrationSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json(createError(error.details.map((detail) => detail.message).join(', ')));
    }

    const suspiciousFields = Object.values(value).some((entry) => isSuspiciousInput(entry));
    if (suspiciousFields) {
      const systemActor = await User.findOne({ role: { $in: ['system_automation', 'super_admin'] }, isDeleted: false }).select('_id').lean<any>();
      if (systemActor?._id) {
        await AuditLog.create({
          actor: systemActor._id,
          action: 'SECURITY_VALIDATION_REJECTED',
          targetType: 'registration',
          target: sanitizePlainText(value.email, 160),
          metadata: { route: '/auth/register/student' },
          severity: 'warning'
        });
      }
      return res.status(400).json(createError('Invalid characters detected in registration form'));
    }

    if (value.password !== value.confirmPassword) {
      return res.status(400).json(createError('Password confirmation does not match'));
    }

    const result = await publicRegistrationService.registerStudent({
      firstName: sanitizePlainText(value.firstName, 80),
      lastName: sanitizePlainText(value.lastName, 80),
      email: sanitizePlainText(value.email, 160).toLowerCase(),
      phone: sanitizePlainText(value.phone, 40),
      nationalId: sanitizePlainText(value.nationalId, 80),
      whatsapp: sanitizePlainText(value.whatsapp, 40),
      password: value.password,
      fatherName: sanitizePlainText(value.fatherName, 120),
      parentPhone: sanitizePlainText(value.parentPhone, 40),
      parentEmail: sanitizePlainText(value.parentEmail, 160).toLowerCase(),
      gender: value.gender,
      classId: value.classId,
      subjectId: value.subjectId,
      teacherId: value.teacherId,
      profileImage: value.profileImage,
      checkoutToken: value.checkoutToken,
      paymentReference: value.paymentReference || buildRegistrationPaymentReference(),
      paymentMethod: value.paymentMethod
    });

    return res.status(201).json(createResponse(result, 'Student account registered successfully'));
  } catch (error: any) {
    const message = error?.message || 'Student registration failed';
    if (/already exists/i.test(message)) {
      return res.status(409).json(createError(message));
    }
    return res.status(400).json(createError(message));
  }
});

router.post('/refresh', authLimiter, validate(refreshSchema), async (req, res) => {
  try {
    const result = await authService.refresh(req.body.refreshToken, getRequestContext(req));
    return res.json(createResponse({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      sessionId: result.tokens.sessionId,
      user: result.user,
      tokens: result.tokens
    }, 'Tokens refreshed'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Refresh failed';
    return res.status(401).json(createError(message));
  }
});

router.post('/logout', authenticate, validate(logoutSchema), async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    await authService.logout({
      userId: req.user!.userId,
      accessToken,
      refreshToken: req.body?.refreshToken,
      sessionId: req.user?.sessionId,
      context: getRequestContext(req)
    });
    return res.json(createResponse({}, 'Logged out successfully'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    return res.status(400).json(createError(message));
  }
});

router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await authService.logoutAll(req.user!.userId);
    return res.json(createResponse({}, 'All sessions revoked successfully'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout all failed';
    return res.status(400).json(createError(message));
  }
});

router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), async (req, res) => {
  try {
    const result = await authService.requestPasswordReset(req.body.email, getRequestContext(req));
    return res.json(createResponse(result, result.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to request password reset';
    return res.status(400).json(createError(message));
  }
});

router.post('/reset-password', authLimiter, validate(resetPasswordSchema), async (req, res) => {
  try {
    const result = await authService.resetPassword(req.body.token, req.body.newPassword);
    return res.json(createResponse(result, result.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset password';
    return res.status(400).json(createError(message));
  }
});

router.post('/email-verification/request', authenticate, async (req, res) => {
  try {
    const result = await authService.requestEmailVerification(req.user!.userId, getRequestContext(req));
    return res.json(createResponse(result, result.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create email verification token';
    return res.status(400).json(createError(message));
  }
});

router.post('/email-verification/confirm', validate(tokenConfirmSchema), async (req, res) => {
  try {
    const result = await authService.confirmEmailVerification(req.body.token);
    return res.json(createResponse(result, result.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email verification failed';
    return res.status(400).json(createError(message));
  }
});

router.post('/phone-verification/request', authenticate, validate(phoneRequestSchema), async (req, res) => {
  try {
    const result = await authService.requestPhoneVerification(req.user!.userId, req.body?.phone, getRequestContext(req));
    return res.json(createResponse(result, result.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create phone verification code';
    return res.status(400).json(createError(message));
  }
});

router.post('/phone-verification/confirm', validate(phoneConfirmSchema), async (req, res) => {
  try {
    const result = await authService.confirmPhoneVerification(req.body.code);
    return res.json(createResponse(result, result.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Phone verification failed';
    return res.status(400).json(createError(message));
  }
});

router.get('/profile', authenticate, async (req, res) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    return res.json(createResponse(profile));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load profile';
    return res.status(404).json(createError(message));
  }
});

router.put('/profile', authenticate, validate(profileUpdateSchema), async (req, res) => {
  try {
    const payload: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      payload.name = String(req.body.name ?? '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      payload.email = String(req.body.email).trim().toLowerCase();
      const existing = await User.findOne({
        email: payload.email,
        _id: { $ne: req.user!.userId },
        isDeleted: false
      }).lean();
      if (existing) return res.status(409).json(createError('Email already exists'));
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
      payload.phone = String(req.body.phone ?? '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'profileImage')) {
      const image = req.body.profileImage;
      payload.profileImage = image == null ? '' : String(image).trim();
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json(createError('No profile fields to update'));
    }

    const user = await User.findOneAndUpdate(
      { _id: req.user!.userId, isDeleted: false },
      { $set: payload },
      { new: true, runValidators: true }
    ).select('-password').lean<any>();
    if (!user) return res.status(404).json(createError('User not found'));

    await AuditLog.create({
      actor: req.user!.userId,
      branchId: user.branchId ?? null,
      action: 'AUTH_PROFILE_UPDATE',
      target: req.user!.userId,
      targetType: 'user',
      severity: 'info',
      metadata: { fields: Object.keys(payload) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? ''
    });

    return res.json(createResponse(await authService.getProfile(req.user!.userId), 'Profile updated successfully'));
  } catch (error: any) {
    return res.status(400).json(createError(error?.message || 'Failed to update profile'));
  }
});

router.post('/profile/change-password', authenticate, validate(changePasswordSchema), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user!.userId, isDeleted: false }).select('+password +passwordHistory.hash');
    if (!user) return res.status(404).json(createError('User not found'));

    const validPassword = await comparePassword(req.body.currentPassword, user.password as string);
    if (!validPassword) return res.status(400).json(createError('Current password is incorrect'));

    user.password = await hashPassword(req.body.newPassword);
    user.mustChangePassword = false;
    await user.save();

    await AuditLog.create({
      actor: req.user!.userId,
      branchId: user.branchId ?? null,
      action: 'AUTH_PROFILE_PASSWORD_CHANGED',
      target: req.user!.userId,
      targetType: 'user',
      severity: 'warning',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? ''
    });

    return res.json(createResponse({}, 'Password changed successfully'));
  } catch (error: any) {
    return res.status(400).json(createError(error?.message || 'Failed to change password'));
  }
});

export const authRouter = router;
