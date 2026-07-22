import { Router, type Request, type Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { Notification } from '../../models/Notification';
import { ClassModel } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { User } from '../../models/User';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import { resolveLocalizedText, normalizeLocalizedInput } from '../../utils/localizedText';
import {
  listPublicAnnouncements,
  resolvePublicVisibilityFlags
} from '../../services/publicAnnouncementsService';

const router = Router();

const manageRoles = ['super_admin', 'admin', 'teacher', 'accountant', 'librarian', 'branch_manager', 'owner'] as const;
const readRoles = ['super_admin', 'admin', 'teacher', 'student', 'parent', 'owner', 'branch_manager', 'system_automation', 'family_student', 'accountant', 'librarian'] as const;
const roleSchema = Joi.string().valid(...readRoles);

const localizedTextSchema = Joi.alternatives().try(
  Joi.string().trim(),
  Joi.object({
    en: Joi.string().trim().allow(''),
    fa: Joi.string().trim().allow(''),
    ps: Joi.string().trim().allow('')
  })
);

const notificationCreateSchema = Joi.object({
  title: localizedTextSchema.required(),
  description: localizedTextSchema.allow('', null).optional(),
  message: localizedTextSchema.allow('', null).optional(),
  classId: Joi.string().hex().length(24).allow('', null).optional(),
  subjectId: Joi.string().hex().length(24).allow('', null).optional(),
  teacherId: Joi.string().hex().length(24).allow('', null).optional(),
  category: Joi.string().valid('general', 'holiday', 'emergency', 'class_notice', 'academic_reminder', 'event_update', 'exam_alert').optional(),
  publishDate: Joi.date().allow(null).optional(),
  expiresAt: Joi.date().allow(null).optional(),
  publishStatus: Joi.string().valid('draft', 'published').optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  pinned: Joi.boolean().optional(),
  severity: Joi.string().valid('info', 'warning', 'critical').optional(),
  branchId: Joi.string().hex().length(24).allow('', null).optional(),
  isPublic: Joi.boolean().optional(),
  visibility: Joi.string().valid('public', 'private', 'internal').optional(),
  recipientRoles: Joi.alternatives().try(
    Joi.array().items(roleSchema).optional(),
    roleSchema.optional()
  ),
  recipientIds: Joi.alternatives().try(
    Joi.array().items(Joi.string().hex().length(24)).optional(),
    Joi.string().hex().length(24).optional()
  )
}).or('description', 'message');

const notificationUpdateSchema = Joi.object({
  title: localizedTextSchema.optional(),
  description: localizedTextSchema.allow('', null).optional(),
  message: localizedTextSchema.allow('', null).optional(),
  classId: Joi.string().hex().length(24).allow('', null).optional(),
  subjectId: Joi.string().hex().length(24).allow('', null).optional(),
  teacherId: Joi.string().hex().length(24).allow('', null).optional(),
  category: Joi.string().valid('general', 'holiday', 'emergency', 'class_notice', 'academic_reminder', 'event_update', 'exam_alert').optional(),
  publishDate: Joi.date().allow(null).optional(),
  expiresAt: Joi.date().allow(null).optional(),
  publishStatus: Joi.string().valid('draft', 'published').optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  pinned: Joi.boolean().optional(),
  severity: Joi.string().valid('info', 'warning', 'critical').optional(),
  branchId: Joi.string().hex().length(24).allow('', null).optional(),
  isPublic: Joi.boolean().optional(),
  visibility: Joi.string().valid('public', 'private', 'internal').optional(),
  recipientRoles: Joi.alternatives().try(
    Joi.array().items(roleSchema).optional(),
    roleSchema.optional()
  ),
  recipientIds: Joi.alternatives().try(
    Joi.array().items(Joi.string().hex().length(24)).optional(),
    Joi.string().hex().length(24).optional()
  )
}).min(1);

const idParamsSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  })
});

const notificationQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('', null).optional(),
    lang: Joi.string().valid('en', 'fa', 'ps').optional()
  })
});

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch {
        // Fall back to comma splitting below.
      }
    }

    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function resolveRequestLang(req: Request) {
  const raw = String(req.query.lang || req.headers['accept-language'] || 'en').split(',')[0]?.trim() || 'en';
  const code = raw.split('-')[0].toLowerCase();
  return code === 'fa' || code === 'ps' ? code : 'en';
}

function serializeNotification(notification: any, lang = 'en') {
  const classRef = notification?.classId;
  const subjectRef = notification?.subjectId;
  const teacherRef = notification?.teacherId;
  const title = resolveLocalizedText(notification?.title, lang);
  const description = resolveLocalizedText(notification?.description ?? notification?.message, lang);

  return {
    ...notification,
    classId: classRef?._id ?? classRef ?? null,
    subjectId: subjectRef?._id ?? subjectRef ?? null,
    teacherId: teacherRef?._id ?? teacherRef ?? null,
    className: classRef?.className ?? classRef?.name ?? '',
    classCode: classRef?.classCode ?? '',
    subjectName: subjectRef?.title ?? '',
    teacherName: teacherRef?.name ?? '',
    title,
    description,
    message: description,
    titleLocalized: notification?.title,
    descriptionLocalized: notification?.description ?? notification?.message,
    createdAt: notification?.createdAt ?? notification?.publishDate ?? null,
    publishDate: notification?.publishDate ?? notification?.createdAt ?? null,
    expiresAt: notification?.expiresAt ?? null,
    publishStatus: notification?.publishStatus ?? 'draft'
  };
}

function isManagementViewer(req: any) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  return ['super_admin', 'admin', 'owner', 'branch_manager'].includes(role);
}

function buildManagementFilter(req: any) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  const branchId = req.user?.branchId;

  if (role === 'super_admin' || !branchId) {
    return { isDeleted: false };
  }

  return {
    isDeleted: false,
    $or: [
      { branchId: new mongoose.Types.ObjectId(branchId) },
      { branchId: null }
    ]
  };
}

function buildAudienceFilter(req: any, publishedOnly = true) {
  const userId = req.user?.userId;
  const role = req.user?.role;
  const canonicalRole = req.user?.canonicalRole;
  const branchId = req.user?.branchId;
  const roleCandidates = [role, canonicalRole].filter(Boolean);
  const audienceClauses: any[] = [
    { recipientRoles: { $size: 0 }, recipientIds: { $size: 0 } }
  ];

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    audienceClauses.push({ recipientIds: new mongoose.Types.ObjectId(userId) });
  }

  if (roleCandidates.length) {
    audienceClauses.push({ recipientRoles: { $in: roleCandidates } });
  }

  if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
    audienceClauses.push({ branchId: new mongoose.Types.ObjectId(branchId) });
  }

  const filter: Record<string, unknown> = {
    isDeleted: false,
    $or: audienceClauses
  };

  if (publishedOnly) {
    filter.publishStatus = 'published';
    filter.$and = [
      ...(Array.isArray((filter as any).$and) ? (filter as any).$and : []),
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }
    ];
  }

  return filter;
}

function applySearch(filter: any, search: string) {
  if (!search) {
    return filter;
  }

  const searchFilter = {
    $or: [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } }
    ]
  };

  if (filter.$or) {
    const audienceFilter = { ...filter };
    delete audienceFilter.$or;
    return {
      ...audienceFilter,
      $and: [
        { $or: filter.$or },
        searchFilter
      ]
    };
  }

  return {
    ...filter,
    ...searchFilter
  };
}

async function assertNotificationTargets(payload: { classId?: unknown; subjectId?: unknown; teacherId?: unknown }) {
  const throwValidationError = (message: string) => {
    const error = new Error(message);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  };

  const classId = payload.classId ? String(payload.classId) : '';
  const subjectId = payload.subjectId ? String(payload.subjectId) : '';
  const teacherId = payload.teacherId ? String(payload.teacherId) : '';

  if (!classId && !subjectId && !teacherId) {
    return;
  }

  const [klass, subject, teacher] = await Promise.all([
    classId ? ClassModel.findOne({ _id: classId, isDeleted: false }).lean<any>() : Promise.resolve(null),
    subjectId ? Subject.findOne({ _id: subjectId, isDeleted: false }).lean<any>() : Promise.resolve(null),
    teacherId ? User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false }).lean<any>() : Promise.resolve(null)
  ]);

  if (classId && !klass) {
    throwValidationError('Selected class does not exist');
  }

  if (subjectId && !subject) {
    throwValidationError('Selected subject does not exist');
  }

  if (teacherId && !teacher) {
    throwValidationError('Selected teacher does not exist');
  }

  if (klass && subject && String(subject.classId) !== String(klass._id)) {
    throwValidationError('Selected subject does not belong to the chosen class');
  }

  if (subject && teacher) {
    const subjectTeacherId = subject.teacher ? String(subject.teacher) : '';
    const teacherSubjectIds = Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects.map((item: any) => String(item)) : [];
    const teacherClassIds = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses.map((item: any) => String(item)) : [];
    const subjectClassId = String(subject.classId ?? classId ?? '');
    const teacherMatchesSubject =
      (subjectTeacherId && subjectTeacherId === String(teacher._id)) ||
      teacherSubjectIds.includes(String(subject._id)) ||
      teacherClassIds.includes(subjectClassId);

    if (!teacherMatchesSubject) {
      throwValidationError('Selected teacher is not assigned to the chosen subject');
    }
  }
}

function normalizeNotificationPayload(req: Request, validatedBody: Record<string, any>, existingNotification?: any) {
  const descriptionInput = validatedBody.description
    ?? validatedBody.message
    ?? existingNotification?.description
    ?? existingNotification?.message
    ?? '';
  const recipientRoles = normalizeStringArray(validatedBody.recipientRoles);
  const recipientIds = normalizeStringArray(validatedBody.recipientIds);
  const publishStatus = String(validatedBody.publishStatus ?? existingNotification?.publishStatus ?? 'draft');
  const publishDate = validatedBody.publishDate !== undefined
    ? (validatedBody.publishDate ? new Date(validatedBody.publishDate) : null)
    : publishStatus === 'published'
      ? existingNotification?.publishDate ?? new Date()
      : existingNotification?.publishDate ?? null;

  const visibilityFlags = resolvePublicVisibilityFlags({
    isPublic: validatedBody.isPublic ?? existingNotification?.isPublic,
    visibility: validatedBody.visibility ?? existingNotification?.visibility,
    recipientRoles,
    recipientIds
  });

  return {
    title: normalizeLocalizedInput(validatedBody.title ?? existingNotification?.title ?? ''),
    description: normalizeLocalizedInput(descriptionInput),
    message: normalizeLocalizedInput(descriptionInput),
    classId: validatedBody.classId === '' ? null : (validatedBody.classId ?? existingNotification?.classId ?? null),
    subjectId: validatedBody.subjectId === '' ? null : (validatedBody.subjectId ?? existingNotification?.subjectId ?? null),
    teacherId: validatedBody.teacherId === '' ? null : (validatedBody.teacherId ?? existingNotification?.teacherId ?? null),
    publishDate,
    expiresAt: validatedBody.expiresAt !== undefined
      ? (validatedBody.expiresAt ? new Date(validatedBody.expiresAt) : null)
      : existingNotification?.expiresAt ?? null,
    publishStatus,
    category: validatedBody.category ?? existingNotification?.category ?? 'general',
    priority: validatedBody.priority ?? existingNotification?.priority ?? 'normal',
    pinned: validatedBody.pinned ?? existingNotification?.pinned ?? false,
    severity: validatedBody.severity ?? existingNotification?.severity ?? 'info',
    branchId: validatedBody.branchId === '' ? null : (validatedBody.branchId ?? existingNotification?.branchId ?? req.user?.branchId ?? null),
    recipientRoles,
    recipientIds,
    isPublic: visibilityFlags.isPublic,
    visibility: visibilityFlags.visibility
  };
}

router.get('/public', validate(notificationQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 6);
    const search = String(req.query.search || '').trim();
    const lang = resolveRequestLang(req);
    const result = await listPublicAnnouncements({ page, limit, search, lang });
    res.json(createResponse(result.items, '', {
      page: result.page,
      limit: result.limit,
      total: result.total
    }));
  } catch (error) {
    next(error);
  }
});

router.use(authenticate);

router.post('/', authorize([...manageRoles]), async (req, res, next) => {
  try {
    const { error, value } = notificationCreateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json(createError(error.details.map((detail) => detail.message).join(', ')));
    }

    const payload = normalizeNotificationPayload(req, value);
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (role === 'teacher') {
      payload.teacherId = req.user?.userId ?? payload.teacherId;
      if (!payload.recipientRoles?.length) {
        return res.status(400).json(createError('Teachers must select a target audience'));
      }
      const teacherAllowed = new Set(['student', 'parent', 'family_student']);
      if (payload.recipientRoles.some((item: string) => !teacherAllowed.has(String(item)))) {
        return res.status(400).json(createError('Audience is not permitted for teachers'));
      }
      if (!payload.classId) {
        return res.status(400).json(createError('Class is required for teacher announcements'));
      }
      const teacherObjectId = new mongoose.Types.ObjectId(String(req.user?.userId));
      const klass = await ClassModel.findOne({
        _id: payload.classId,
        isDeleted: false,
        $or: [{ teacherId: teacherObjectId }, { assignedTeachers: teacherObjectId }]
      }).lean<any>();
      if (!klass) {
        return res.status(403).json(createError('You can only announce to your assigned classes'));
      }
      payload.branchId = payload.branchId ?? req.user?.branchId ?? klass.branchId ?? null;
    }

    await assertNotificationTargets(payload);
    const notification = await Notification.create(payload);

    const lang = resolveRequestLang(req);
    res.status(201).json(createResponse(serializeNotification(notification.toObject(), lang), 'Notification created successfully'));
  } catch (error) {
    next(error);
  }
});

router.get('/unread-count', authorize([...readRoles]), async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json(createError('Authentication required'));
    }

    const filter = {
      ...buildAudienceFilter(req, true),
      readBy: { $nin: [new mongoose.Types.ObjectId(req.user.userId)] }
    };

    const count = await Notification.countDocuments(filter);
    res.json(createResponse({ unreadCount: count }));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', authorize([...readRoles]), validate(idParamsSchema), async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json(createError('Authentication required'));
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const filter = {
      ...buildAudienceFilter(req, true),
      _id: req.params.id
    };

    const readAt = new Date();
    const notification = await Notification.findOneAndUpdate(
      filter,
      {
        $addToSet: { readBy: userId },
        $set: { [`metadata.readAtBy.${req.user.userId}`]: readAt }
      },
      { new: true }
    )
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email')
      .lean<any>();

    if (!notification) {
      return res.status(404).json(createError('Notification not found'));
    }

    const lang = resolveRequestLang(req);
    const serialized = serializeNotification(notification, lang);
    serialized.readAt = readAt;
    res.json(createResponse(serialized, 'Notification marked as read'));
  } catch (error) {
    next(error);
  }
});

router.get('/', authorize([...readRoles]), validate(notificationQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const role = req.user?.canonicalRole ?? req.user?.role;
    let baseFilter: Record<string, unknown>;
    if (isManagementViewer(req)) {
      baseFilter = buildManagementFilter(req);
    } else if (role === 'teacher' && req.user?.userId) {
      const audience = buildAudienceFilter(req, true);
      const audienceOr = Array.isArray((audience as any).$or) ? (audience as any).$or : [];
      baseFilter = {
        isDeleted: false,
        $or: [
          { teacherId: new mongoose.Types.ObjectId(String(req.user.userId)) },
          {
            publishStatus: 'published',
            $and: [
              { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
              { $or: audienceOr }
            ]
          }
        ]
      };
    } else {
      baseFilter = buildAudienceFilter(req, true);
    }
    const filter = applySearch(baseFilter, search);

    const lang = resolveRequestLang(req);
    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .populate('classId', 'className name classCode')
        .populate('subjectId', 'title code')
        .populate('teacherId', 'name email')
        .lean()
        .sort({ pinned: -1, priority: -1, publishDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter)
    ]);

    res.json(createResponse(notifications.map((item) => serializeNotification(item, lang)), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorize([...readRoles]), validate(idParamsSchema), async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole ?? req.user?.role;
    let filter: Record<string, unknown>;
    if (isManagementViewer(req)) {
      filter = { ...buildManagementFilter(req), _id: req.params.id };
    } else if (role === 'teacher' && req.user?.userId) {
      const audience = buildAudienceFilter(req, true);
      const audienceOr = Array.isArray((audience as any).$or) ? (audience as any).$or : [];
      filter = {
        isDeleted: false,
        _id: req.params.id,
        $or: [
          { teacherId: new mongoose.Types.ObjectId(String(req.user.userId)) },
          {
            publishStatus: 'published',
            $and: [
              { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
              { $or: audienceOr }
            ]
          }
        ]
      };
    } else {
      filter = { ...buildAudienceFilter(req, true), _id: req.params.id };
    }

    const notification = await Notification.findOne(filter).lean<any>();
    if (!notification) {
      return res.status(404).json(createError('Notification not found'));
    }

    const populatedNotification = await Notification.findById(notification._id)
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email')
      .lean<any>();

    const lang = resolveRequestLang(req);
    res.json(createResponse(serializeNotification(populatedNotification, lang)));
  } catch (error) {
    next(error);
  }
});

const updateNotificationHandler = async (req: Request, res: Response, next: any) => {
  try {
    const { error, value } = notificationUpdateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json(createError(error.details.map((detail) => detail.message).join(', ')));
    }

    const role = req.user?.canonicalRole ?? req.user?.role;
    const ownershipFilter = role === 'teacher'
      ? {
          isDeleted: false,
          teacherId: new mongoose.Types.ObjectId(String(req.user?.userId)),
          _id: req.params.id
        }
      : {
          ...buildManagementFilter(req),
          _id: req.params.id
        };

    const existingNotification = await Notification.findOne(ownershipFilter).lean<any>();

    if (!existingNotification) {
      return res.status(404).json(createError('Notification not found'));
    }

    const payload = normalizeNotificationPayload(req, value, existingNotification);
    if (role === 'teacher') {
      payload.teacherId = req.user?.userId;
      if (!payload.recipientRoles?.length) {
        return res.status(400).json(createError('Teachers must select a target audience'));
      }
      if (payload.classId) {
        const teacherObjectId = new mongoose.Types.ObjectId(String(req.user?.userId));
        const klass = await ClassModel.findOne({
          _id: payload.classId,
          isDeleted: false,
          $or: [{ teacherId: teacherObjectId }, { assignedTeachers: teacherObjectId }]
        }).lean<any>();
        if (!klass) {
          return res.status(403).json(createError('You can only announce to your assigned classes'));
        }
      }
    }

    await assertNotificationTargets(payload);
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    )
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email')
      .lean();

    const lang = resolveRequestLang(req);
    res.json(createResponse(serializeNotification(notification, lang), 'Notification updated successfully'));
  } catch (error) {
    next(error);
  }
};

router.put('/:id', authorize([...manageRoles]), validate(idParamsSchema), updateNotificationHandler);
router.patch('/:id', authorize([...manageRoles]), validate(idParamsSchema), updateNotificationHandler);

router.delete('/:id', authorize([...manageRoles]), validate(idParamsSchema), async (req, res, next) => {
  try {
    const deletedAt = new Date();
    const role = req.user?.canonicalRole ?? req.user?.role;
    const filter = role === 'teacher'
      ? {
          isDeleted: false,
          teacherId: new mongoose.Types.ObjectId(String(req.user?.userId)),
          _id: req.params.id
        }
      : {
          ...buildManagementFilter(req),
          _id: req.params.id
        };

    const notification = await Notification.findOneAndUpdate(
      filter,
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deletedBy: req.user?.userId ?? null
        }
      },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).json(createError('Notification not found'));
    }

    res.json(createResponse({}, 'Notification deleted successfully'));
  } catch (error) {
    next(error);
  }
});

export const notificationRouter = router;
