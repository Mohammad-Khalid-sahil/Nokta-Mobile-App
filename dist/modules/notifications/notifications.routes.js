"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const mongoose_1 = __importDefault(require("mongoose"));
const Notification_1 = require("../../models/Notification");
const Class_1 = require("../../models/Class");
const Subject_1 = require("../../models/Subject");
const User_1 = require("../../models/User");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const localizedText_1 = require("../../utils/localizedText");
const publicAnnouncementsService_1 = require("../../services/publicAnnouncementsService");
const router = (0, express_1.Router)();
const manageRoles = ['super_admin', 'admin', 'teacher', 'accountant', 'librarian', 'branch_manager', 'owner'];
const readRoles = ['super_admin', 'admin', 'teacher', 'student', 'parent', 'owner', 'branch_manager', 'system_automation', 'family_student', 'accountant', 'librarian'];
const roleSchema = joi_1.default.string().valid(...readRoles);
const localizedTextSchema = joi_1.default.alternatives().try(joi_1.default.string().trim(), joi_1.default.object({
    en: joi_1.default.string().trim().allow(''),
    fa: joi_1.default.string().trim().allow(''),
    ps: joi_1.default.string().trim().allow('')
}));
const notificationCreateSchema = joi_1.default.object({
    title: localizedTextSchema.required(),
    description: localizedTextSchema.allow('', null).optional(),
    message: localizedTextSchema.allow('', null).optional(),
    classId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    subjectId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    teacherId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    category: joi_1.default.string().valid('general', 'holiday', 'emergency', 'class_notice', 'academic_reminder', 'event_update', 'exam_alert').optional(),
    publishDate: joi_1.default.date().allow(null).optional(),
    expiresAt: joi_1.default.date().allow(null).optional(),
    publishStatus: joi_1.default.string().valid('draft', 'published').optional(),
    priority: joi_1.default.string().valid('low', 'normal', 'high', 'urgent').optional(),
    pinned: joi_1.default.boolean().optional(),
    severity: joi_1.default.string().valid('info', 'warning', 'critical').optional(),
    branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    isPublic: joi_1.default.boolean().optional(),
    visibility: joi_1.default.string().valid('public', 'private', 'internal').optional(),
    recipientRoles: joi_1.default.alternatives().try(joi_1.default.array().items(roleSchema).optional(), roleSchema.optional()),
    recipientIds: joi_1.default.alternatives().try(joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(), joi_1.default.string().hex().length(24).optional())
}).or('description', 'message');
const notificationUpdateSchema = joi_1.default.object({
    title: localizedTextSchema.optional(),
    description: localizedTextSchema.allow('', null).optional(),
    message: localizedTextSchema.allow('', null).optional(),
    classId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    subjectId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    teacherId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    category: joi_1.default.string().valid('general', 'holiday', 'emergency', 'class_notice', 'academic_reminder', 'event_update', 'exam_alert').optional(),
    publishDate: joi_1.default.date().allow(null).optional(),
    expiresAt: joi_1.default.date().allow(null).optional(),
    publishStatus: joi_1.default.string().valid('draft', 'published').optional(),
    priority: joi_1.default.string().valid('low', 'normal', 'high', 'urgent').optional(),
    pinned: joi_1.default.boolean().optional(),
    severity: joi_1.default.string().valid('info', 'warning', 'critical').optional(),
    branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    isPublic: joi_1.default.boolean().optional(),
    visibility: joi_1.default.string().valid('public', 'private', 'internal').optional(),
    recipientRoles: joi_1.default.alternatives().try(joi_1.default.array().items(roleSchema).optional(), roleSchema.optional()),
    recipientIds: joi_1.default.alternatives().try(joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(), joi_1.default.string().hex().length(24).optional())
}).min(1);
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    })
});
const notificationQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        search: joi_1.default.string().allow('', null).optional(),
        lang: joi_1.default.string().valid('en', 'fa', 'ps').optional()
    })
});
function normalizeStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map((item) => String(item).trim()).filter(Boolean);
                }
            }
            catch {
                // Fall back to comma splitting below.
            }
        }
        return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
}
function resolveRequestLang(req) {
    const raw = String(req.query.lang || req.headers['accept-language'] || 'en').split(',')[0]?.trim() || 'en';
    const code = raw.split('-')[0].toLowerCase();
    return code === 'fa' || code === 'ps' ? code : 'en';
}
function serializeNotification(notification, lang = 'en') {
    const classRef = notification?.classId;
    const subjectRef = notification?.subjectId;
    const teacherRef = notification?.teacherId;
    const title = (0, localizedText_1.resolveLocalizedText)(notification?.title, lang);
    const description = (0, localizedText_1.resolveLocalizedText)(notification?.description ?? notification?.message, lang);
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
function isManagementViewer(req) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    return ['super_admin', 'admin', 'owner', 'branch_manager'].includes(role);
}
function buildManagementFilter(req) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    const branchId = req.user?.branchId;
    if (role === 'super_admin' || !branchId) {
        return { isDeleted: false };
    }
    return {
        isDeleted: false,
        $or: [
            { branchId: new mongoose_1.default.Types.ObjectId(branchId) },
            { branchId: null }
        ]
    };
}
function buildAudienceFilter(req, publishedOnly = true) {
    const userId = req.user?.userId;
    const role = req.user?.role;
    const canonicalRole = req.user?.canonicalRole;
    const branchId = req.user?.branchId;
    const roleCandidates = [role, canonicalRole].filter(Boolean);
    const audienceClauses = [
        { recipientRoles: { $size: 0 }, recipientIds: { $size: 0 } }
    ];
    if (userId && mongoose_1.default.Types.ObjectId.isValid(userId)) {
        audienceClauses.push({ recipientIds: new mongoose_1.default.Types.ObjectId(userId) });
    }
    if (roleCandidates.length) {
        audienceClauses.push({ recipientRoles: { $in: roleCandidates } });
    }
    if (branchId && mongoose_1.default.Types.ObjectId.isValid(branchId)) {
        audienceClauses.push({ branchId: new mongoose_1.default.Types.ObjectId(branchId) });
    }
    const filter = {
        isDeleted: false,
        $or: audienceClauses
    };
    if (publishedOnly) {
        filter.publishStatus = 'published';
        filter.$and = [
            ...(Array.isArray(filter.$and) ? filter.$and : []),
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }
        ];
    }
    return filter;
}
function applySearch(filter, search) {
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
async function assertNotificationTargets(payload) {
    const throwValidationError = (message) => {
        const error = new Error(message);
        error.statusCode = 400;
        throw error;
    };
    const classId = payload.classId ? String(payload.classId) : '';
    const subjectId = payload.subjectId ? String(payload.subjectId) : '';
    const teacherId = payload.teacherId ? String(payload.teacherId) : '';
    if (!classId && !subjectId && !teacherId) {
        return;
    }
    const [klass, subject, teacher] = await Promise.all([
        classId ? Class_1.ClassModel.findOne({ _id: classId, isDeleted: false }).lean() : Promise.resolve(null),
        subjectId ? Subject_1.Subject.findOne({ _id: subjectId, isDeleted: false }).lean() : Promise.resolve(null),
        teacherId ? User_1.User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false }).lean() : Promise.resolve(null)
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
        const teacherSubjectIds = Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects.map((item) => String(item)) : [];
        const teacherClassIds = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses.map((item) => String(item)) : [];
        const subjectClassId = String(subject.classId ?? classId ?? '');
        const teacherMatchesSubject = (subjectTeacherId && subjectTeacherId === String(teacher._id)) ||
            teacherSubjectIds.includes(String(subject._id)) ||
            teacherClassIds.includes(subjectClassId);
        if (!teacherMatchesSubject) {
            throwValidationError('Selected teacher is not assigned to the chosen subject');
        }
    }
}
function normalizeNotificationPayload(req, validatedBody, existingNotification) {
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
    const visibilityFlags = (0, publicAnnouncementsService_1.resolvePublicVisibilityFlags)({
        isPublic: validatedBody.isPublic ?? existingNotification?.isPublic,
        visibility: validatedBody.visibility ?? existingNotification?.visibility,
        recipientRoles,
        recipientIds
    });
    return {
        title: (0, localizedText_1.normalizeLocalizedInput)(validatedBody.title ?? existingNotification?.title ?? ''),
        description: (0, localizedText_1.normalizeLocalizedInput)(descriptionInput),
        message: (0, localizedText_1.normalizeLocalizedInput)(descriptionInput),
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
router.get('/public', (0, validate_1.validate)(notificationQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 6);
        const search = String(req.query.search || '').trim();
        const lang = resolveRequestLang(req);
        const result = await (0, publicAnnouncementsService_1.listPublicAnnouncements)({ page, limit, search, lang });
        res.json((0, response_1.createResponse)(result.items, '', {
            page: result.page,
            limit: result.limit,
            total: result.total
        }));
    }
    catch (error) {
        next(error);
    }
});
router.use(auth_1.authenticate);
router.post('/', (0, auth_1.authorize)([...manageRoles]), async (req, res, next) => {
    try {
        const { error, value } = notificationCreateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            return res.status(400).json((0, response_1.createError)(error.details.map((detail) => detail.message).join(', ')));
        }
        const payload = normalizeNotificationPayload(req, value);
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (role === 'teacher') {
            payload.teacherId = req.user?.userId ?? payload.teacherId;
            if (!payload.recipientRoles?.length) {
                return res.status(400).json((0, response_1.createError)('Teachers must select a target audience'));
            }
            const teacherAllowed = new Set(['student', 'parent', 'family_student']);
            if (payload.recipientRoles.some((item) => !teacherAllowed.has(String(item)))) {
                return res.status(400).json((0, response_1.createError)('Audience is not permitted for teachers'));
            }
            if (!payload.classId) {
                return res.status(400).json((0, response_1.createError)('Class is required for teacher announcements'));
            }
            const teacherObjectId = new mongoose_1.default.Types.ObjectId(String(req.user?.userId));
            const klass = await Class_1.ClassModel.findOne({
                _id: payload.classId,
                isDeleted: false,
                $or: [{ teacherId: teacherObjectId }, { assignedTeachers: teacherObjectId }]
            }).lean();
            if (!klass) {
                return res.status(403).json((0, response_1.createError)('You can only announce to your assigned classes'));
            }
            payload.branchId = payload.branchId ?? req.user?.branchId ?? klass.branchId ?? null;
        }
        await assertNotificationTargets(payload);
        const notification = await Notification_1.Notification.create(payload);
        const lang = resolveRequestLang(req);
        res.status(201).json((0, response_1.createResponse)(serializeNotification(notification.toObject(), lang), 'Notification created successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/unread-count', (0, auth_1.authorize)([...readRoles]), async (req, res, next) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json((0, response_1.createError)('Authentication required'));
        }
        const filter = {
            ...buildAudienceFilter(req, true),
            readBy: { $nin: [new mongoose_1.default.Types.ObjectId(req.user.userId)] }
        };
        const count = await Notification_1.Notification.countDocuments(filter);
        res.json((0, response_1.createResponse)({ unreadCount: count }));
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id/read', (0, auth_1.authorize)([...readRoles]), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json((0, response_1.createError)('Authentication required'));
        }
        const userId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        const filter = {
            ...buildAudienceFilter(req, true),
            _id: req.params.id
        };
        const readAt = new Date();
        const notification = await Notification_1.Notification.findOneAndUpdate(filter, {
            $addToSet: { readBy: userId },
            $set: { [`metadata.readAtBy.${req.user.userId}`]: readAt }
        }, { new: true })
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email')
            .lean();
        if (!notification) {
            return res.status(404).json((0, response_1.createError)('Notification not found'));
        }
        const lang = resolveRequestLang(req);
        const serialized = serializeNotification(notification, lang);
        serialized.readAt = readAt;
        res.json((0, response_1.createResponse)(serialized, 'Notification marked as read'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, auth_1.authorize)([...readRoles]), (0, validate_1.validate)(notificationQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const role = req.user?.canonicalRole ?? req.user?.role;
        let baseFilter;
        if (isManagementViewer(req)) {
            baseFilter = buildManagementFilter(req);
        }
        else if (role === 'teacher' && req.user?.userId) {
            const audience = buildAudienceFilter(req, true);
            const audienceOr = Array.isArray(audience.$or) ? audience.$or : [];
            baseFilter = {
                isDeleted: false,
                $or: [
                    { teacherId: new mongoose_1.default.Types.ObjectId(String(req.user.userId)) },
                    {
                        publishStatus: 'published',
                        $and: [
                            { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
                            { $or: audienceOr }
                        ]
                    }
                ]
            };
        }
        else {
            baseFilter = buildAudienceFilter(req, true);
        }
        const filter = applySearch(baseFilter, search);
        const lang = resolveRequestLang(req);
        const [notifications, total] = await Promise.all([
            Notification_1.Notification.find(filter)
                .populate('classId', 'className name classCode')
                .populate('subjectId', 'title code')
                .populate('teacherId', 'name email')
                .lean()
                .sort({ pinned: -1, priority: -1, publishDate: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Notification_1.Notification.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(notifications.map((item) => serializeNotification(item, lang)), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, auth_1.authorize)([...readRoles]), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        let filter;
        if (isManagementViewer(req)) {
            filter = { ...buildManagementFilter(req), _id: req.params.id };
        }
        else if (role === 'teacher' && req.user?.userId) {
            const audience = buildAudienceFilter(req, true);
            const audienceOr = Array.isArray(audience.$or) ? audience.$or : [];
            filter = {
                isDeleted: false,
                _id: req.params.id,
                $or: [
                    { teacherId: new mongoose_1.default.Types.ObjectId(String(req.user.userId)) },
                    {
                        publishStatus: 'published',
                        $and: [
                            { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
                            { $or: audienceOr }
                        ]
                    }
                ]
            };
        }
        else {
            filter = { ...buildAudienceFilter(req, true), _id: req.params.id };
        }
        const notification = await Notification_1.Notification.findOne(filter).lean();
        if (!notification) {
            return res.status(404).json((0, response_1.createError)('Notification not found'));
        }
        const populatedNotification = await Notification_1.Notification.findById(notification._id)
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email')
            .lean();
        const lang = resolveRequestLang(req);
        res.json((0, response_1.createResponse)(serializeNotification(populatedNotification, lang)));
    }
    catch (error) {
        next(error);
    }
});
const updateNotificationHandler = async (req, res, next) => {
    try {
        const { error, value } = notificationUpdateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            return res.status(400).json((0, response_1.createError)(error.details.map((detail) => detail.message).join(', ')));
        }
        const role = req.user?.canonicalRole ?? req.user?.role;
        const ownershipFilter = role === 'teacher'
            ? {
                isDeleted: false,
                teacherId: new mongoose_1.default.Types.ObjectId(String(req.user?.userId)),
                _id: req.params.id
            }
            : {
                ...buildManagementFilter(req),
                _id: req.params.id
            };
        const existingNotification = await Notification_1.Notification.findOne(ownershipFilter).lean();
        if (!existingNotification) {
            return res.status(404).json((0, response_1.createError)('Notification not found'));
        }
        const payload = normalizeNotificationPayload(req, value, existingNotification);
        if (role === 'teacher') {
            payload.teacherId = req.user?.userId;
            if (!payload.recipientRoles?.length) {
                return res.status(400).json((0, response_1.createError)('Teachers must select a target audience'));
            }
            if (payload.classId) {
                const teacherObjectId = new mongoose_1.default.Types.ObjectId(String(req.user?.userId));
                const klass = await Class_1.ClassModel.findOne({
                    _id: payload.classId,
                    isDeleted: false,
                    $or: [{ teacherId: teacherObjectId }, { assignedTeachers: teacherObjectId }]
                }).lean();
                if (!klass) {
                    return res.status(403).json((0, response_1.createError)('You can only announce to your assigned classes'));
                }
            }
        }
        await assertNotificationTargets(payload);
        const notification = await Notification_1.Notification.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true })
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email')
            .lean();
        const lang = resolveRequestLang(req);
        res.json((0, response_1.createResponse)(serializeNotification(notification, lang), 'Notification updated successfully'));
    }
    catch (error) {
        next(error);
    }
};
router.put('/:id', (0, auth_1.authorize)([...manageRoles]), (0, validate_1.validate)(idParamsSchema), updateNotificationHandler);
router.patch('/:id', (0, auth_1.authorize)([...manageRoles]), (0, validate_1.validate)(idParamsSchema), updateNotificationHandler);
router.delete('/:id', (0, auth_1.authorize)([...manageRoles]), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const deletedAt = new Date();
        const role = req.user?.canonicalRole ?? req.user?.role;
        const filter = role === 'teacher'
            ? {
                isDeleted: false,
                teacherId: new mongoose_1.default.Types.ObjectId(String(req.user?.userId)),
                _id: req.params.id
            }
            : {
                ...buildManagementFilter(req),
                _id: req.params.id
            };
        const notification = await Notification_1.Notification.findOneAndUpdate(filter, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: req.user?.userId ?? null
            }
        }, { new: true }).lean();
        if (!notification) {
            return res.status(404).json((0, response_1.createError)('Notification not found'));
        }
        res.json((0, response_1.createResponse)({}, 'Notification deleted successfully'));
    }
    catch (error) {
        next(error);
    }
});
exports.notificationRouter = router;
