"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.messagesRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Message_1 = require("../../models/Message");
const User_1 = require("../../models/User");
const Student_1 = require("../../models/Student");
const AuditLog_1 = require("../../models/AuditLog");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const inputSecurity_1 = require("../../utils/inputSecurity");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const studentScope_1 = require("../../utils/studentScope");
const router = (0, express_1.Router)();
const messageQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        category: joi_1.default.string().valid('student', 'teacher', 'customer', 'support', 'academic', 'finance').optional(),
        status: joi_1.default.string().valid('unread', 'read', 'replied', 'closed').optional(),
        priority: joi_1.default.string().valid('low', 'normal', 'high').optional(),
        search: joi_1.default.string().allow('', null).optional(),
        from: joi_1.default.date().optional(),
        to: joi_1.default.date().optional()
    })
});
const createMessageSchema = joi_1.default.object({
    body: joi_1.default.object({
        recipientId: joi_1.default.string().hex().length(24).allow(null).optional(),
        recipientRole: joi_1.default.string().trim().max(40).allow('', null).optional(),
        targetGroup: joi_1.default.string().valid('admin', 'super_admin', 'teacher', 'student').optional(),
        teacherId: joi_1.default.string().hex().length(24).allow(null).optional(),
        studentId: joi_1.default.string().hex().length(24).allow(null).optional(),
        subject: joi_1.default.string().trim().max(200).allow('', null).optional(),
        message: joi_1.default.string().trim().min(2).max(5000).required(),
        category: joi_1.default.string().valid('student', 'teacher', 'customer', 'support', 'academic', 'finance').optional(),
        priority: joi_1.default.string().valid('low', 'normal', 'high').optional()
    })
});
const publicContactSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: joi_1.default.string().trim().min(2).max(120).required(),
        email: joi_1.default.string().trim().max(160).allow('', null).optional().custom((value, helpers) => {
            const normalized = String(value ?? '').trim();
            if (!normalized)
                return normalized;
            const { error } = joi_1.default.string().email({ tlds: { allow: false } }).validate(normalized);
            if (error)
                return helpers.error('string.email');
            return normalized;
        }),
        phone: joi_1.default.string().trim().max(40).allow('', null).optional(),
        subject: joi_1.default.string().trim().max(200).allow('', null).optional(),
        message: joi_1.default.string().trim().min(4).max(2000).required()
    }).custom((value, helpers) => {
        const email = String(value?.email ?? '').trim();
        const phone = String(value?.phone ?? '').trim();
        if (!email && !phone) {
            return helpers.error('any.custom', { message: 'Email or phone is required' });
        }
        return value;
    })
});
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() })
});
const replySchema = joi_1.default.object({
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }),
    body: joi_1.default.object({
        message: joi_1.default.string().trim().min(2).max(5000).required(),
        priority: joi_1.default.string().valid('low', 'normal', 'high').optional()
    })
});
function serializeMessage(item) {
    return {
        ...item,
        _id: item?._id,
        senderId: item?.senderId?._id ?? item?.senderId ?? null,
        senderName: item?.senderName || item?.senderId?.name || '',
        recipientId: item?.recipientId?._id ?? item?.recipientId ?? null,
        recipientName: item?.recipientId?.name || '',
        studentId: item?.studentId?._id ?? item?.studentId ?? null,
        teacherId: item?.teacherId?._id ?? item?.teacherId ?? null,
        teacherName: item?.teacherId?.name || ''
    };
}
async function auditMessage(actorId, action, target, metadata = {}) {
    if (!actorId)
        return;
    await AuditLog_1.AuditLog.create({
        actor: actorId,
        action,
        target,
        targetType: 'message',
        metadata,
        severity: action.includes('SUSPICIOUS') ? 'warning' : 'info'
    });
}
function buildRoleFilter(req, mode) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    const userId = req.user?.userId;
    const branchId = req.user?.branchId;
    const filter = { isDeleted: false };
    if (role === 'branch_manager' && branchId && mode === 'admin') {
        filter.$or = [{ branchId }, { branchId: null, category: 'customer' }];
    }
    if (['super_admin', 'admin'].includes(String(role)) && mode === 'admin') {
        return filter;
    }
    if (role === 'teacher') {
        if (mode === 'sent') {
            filter.senderId = userId;
        }
        else {
            filter.$or = [
                { recipientId: userId },
                { teacherId: userId, messageType: { $in: ['student_to_teacher', 'admin_to_teacher'] } }
            ];
        }
        return filter;
    }
    if (role === 'student') {
        filter.$or = mode === 'sent'
            ? [{ senderId: userId }]
            : [{ recipientId: userId }, { senderId: userId }];
        return filter;
    }
    if (role === 'parent' || role === 'family_student') {
        return filter;
    }
    if (['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role)) && mode === 'admin') {
        return filter;
    }
    if (mode === 'sent') {
        filter.senderId = userId;
    }
    else {
        filter.recipientId = userId;
    }
    return filter;
}
async function applyParentScope(req, filter) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (role !== 'parent' && role !== 'family_student')
        return filter;
    const currentUser = await User_1.User.findById(req.user?.userId).select('familyId parentProfileId').lean();
    const familyStudents = await Student_1.Student.find({
        isDeleted: false,
        ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
        ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
    }).select('_id').lean();
    const studentIds = familyStudents.map((student) => student._id);
    filter.studentId = { $in: studentIds };
    return filter;
}
function applyQueryFilters(filter, query) {
    if (query.category)
        filter.category = query.category;
    if (query.status)
        filter.status = query.status;
    if (query.priority)
        filter.priority = query.priority;
    if (query.search) {
        const search = (0, inputSecurity_1.sanitizePlainText)(query.search, 120);
        filter.$and = [
            ...(Array.isArray(filter.$and) ? filter.$and : []),
            {
                $or: [
                    { subject: { $regex: search, $options: 'i' } },
                    { body: { $regex: search, $options: 'i' } },
                    { senderName: { $regex: search, $options: 'i' } },
                    { senderEmail: { $regex: search, $options: 'i' } }
                ]
            }
        ];
    }
    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from)
            filter.createdAt.$gte = new Date(query.from);
        if (query.to)
            filter.createdAt.$lte = new Date(query.to);
    }
    return filter;
}
async function assertMessageAccess(req, message) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    const userId = String(req.user?.userId ?? '');
    if (['super_admin', 'admin', 'owner'].includes(String(role)))
        return true;
    if (role === 'branch_manager' && req.user?.branchId && String(message.branchId ?? '') === String(req.user.branchId))
        return true;
    if (role === 'teacher') {
        return String(message.teacherId ?? '') === userId
            || String(message.senderId ?? '') === userId
            || String(message.recipientId ?? '') === userId;
    }
    if (role === 'student') {
        return String(message.senderId ?? '') === userId || String(message.recipientId ?? '') === userId;
    }
    if (role === 'parent' || role === 'family_student') {
        const currentUser = await User_1.User.findById(userId).select('familyId parentProfileId').lean();
        const familyStudents = await Student_1.Student.find({
            isDeleted: false,
            ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
            ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
        }).select('_id').lean();
        const allowed = new Set(familyStudents.map((student) => String(student._id)));
        return allowed.has(String(message.studentId ?? ''));
    }
    return false;
}
function shouldMarkAsReadOnOpen(req, message) {
    if (!req.user?.userId || !message || message.status !== 'unread') {
        return false;
    }
    const userId = String(req.user.userId);
    const recipientId = String(message.recipientId ?? '');
    const teacherId = String(message.teacherId ?? '');
    const senderId = String(message.senderId ?? '');
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    const isManagementViewer = ['super_admin', 'admin', 'branch_manager', 'owner'].includes(role);
    const addressedToCurrentUser = recipientId === userId || teacherId === userId;
    return senderId !== userId && (addressedToCurrentUser || isManagementViewer);
}
router.post('/public-contact', rateLimiter_1.publicContactLimiter, (0, validate_1.validate)(publicContactSchema), async (req, res) => {
    try {
        const payload = req.body;
        const combined = `${payload.name} ${payload.email ?? ''} ${payload.phone ?? ''} ${payload.subject ?? ''} ${payload.message}`;
        if ((0, inputSecurity_1.isSuspiciousInput)(combined)) {
            await auditMessage(null, 'MESSAGE_PUBLIC_SUSPICIOUS', 'public-contact', { ip: req.ip, email: payload.email });
            return res.status(400).json((0, response_1.createError)('Message contains unsupported content'));
        }
        const item = await Message_1.Message.create({
            senderRole: 'visitor',
            senderName: (0, inputSecurity_1.sanitizePlainText)(payload.name, 120),
            senderEmail: payload.email ? (0, inputSecurity_1.sanitizePlainText)(payload.email, 160).toLowerCase() : '',
            senderPhone: (0, inputSecurity_1.sanitizePlainText)(payload.phone, 40),
            recipientRole: 'admin',
            targetGroup: 'admin',
            subject: (0, inputSecurity_1.sanitizePlainText)(payload.subject, 200) || 'تماس از صفحه اصلی',
            body: (0, inputSecurity_1.sanitizePlainText)(payload.message, 2000),
            category: 'customer',
            messageType: 'public_contact',
            status: 'unread',
            priority: 'normal'
        });
        res.status(201).json((0, response_1.createResponse)(serializeMessage(item.toObject()), 'پیام شما دریافت شد. به زودی پاسخ می‌دهیم.'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to send message'));
    }
});
router.use(auth_1.authenticate);
router.get('/admin/summary', (0, validate_1.validate)(messageQuerySchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        let filter = buildRoleFilter(req, 'admin');
        filter = await applyParentScope(req, filter);
        const [total, unread, students, teachers, customers, replied, closed, highPriority] = await Promise.all([
            Message_1.Message.countDocuments(filter),
            Message_1.Message.countDocuments({ ...filter, status: 'unread' }),
            Message_1.Message.countDocuments({ ...filter, category: 'student' }),
            Message_1.Message.countDocuments({ ...filter, category: 'teacher' }),
            Message_1.Message.countDocuments({ ...filter, category: 'customer' }),
            Message_1.Message.countDocuments({ ...filter, status: 'replied' }),
            Message_1.Message.countDocuments({ ...filter, status: 'closed' }),
            Message_1.Message.countDocuments({ ...filter, priority: 'high' })
        ]);
        res.json((0, response_1.createResponse)({ total, unread, students, teachers, customers, replied, closed, highPriority }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/admin/inbox', (0, validate_1.validate)(messageQuerySchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        let filter = buildRoleFilter(req, 'admin');
        filter = await applyParentScope(req, filter);
        filter = applyQueryFilters(filter, req.query);
        const [items, total] = await Promise.all([
            Message_1.Message.find(filter)
                .populate('senderId', 'name email role')
                .populate('recipientId', 'name email role')
                .populate('studentId', 'firstName lastName studentId')
                .populate('teacherId', 'name email')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Message_1.Message.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(items.map(serializeMessage), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/inbox', (0, validate_1.validate)(messageQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        let filter = buildRoleFilter(req, 'inbox');
        filter = await applyParentScope(req, filter);
        filter = applyQueryFilters(filter, req.query);
        const [items, total] = await Promise.all([
            Message_1.Message.find(filter)
                .populate('senderId', 'name email role')
                .populate('recipientId', 'name email role')
                .populate('studentId', 'firstName lastName studentId')
                .populate('teacherId', 'name email')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Message_1.Message.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(items.map(serializeMessage), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/sent', (0, validate_1.validate)(messageQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        let filter = buildRoleFilter(req, 'sent');
        filter = await applyParentScope(req, filter);
        filter = applyQueryFilters(filter, req.query);
        const [items, total] = await Promise.all([
            Message_1.Message.find(filter)
                .populate('senderId', 'name email role')
                .populate('recipientId', 'name email role')
                .populate('studentId', 'firstName lastName studentId')
                .populate('teacherId', 'name email')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Message_1.Message.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(items.map(serializeMessage), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/unread-count', async (req, res, next) => {
    try {
        let filter = buildRoleFilter(req, 'inbox');
        filter = await applyParentScope(req, filter);
        filter.status = 'unread';
        const unreadCount = await Message_1.Message.countDocuments(filter);
        res.json((0, response_1.createResponse)({ unreadCount }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const item = await Message_1.Message.findOne({ _id: req.params.id, isDeleted: false })
            .populate('senderId', 'name email role')
            .populate('recipientId', 'name email role')
            .populate('studentId', 'firstName lastName studentId')
            .populate('teacherId', 'name email')
            .lean();
        if (!item || !(await assertMessageAccess(req, item))) {
            return res.status(404).json((0, response_1.createError)('Message not found'));
        }
        if (shouldMarkAsReadOnOpen(req, item)) {
            await Message_1.Message.updateOne({ _id: item._id }, { $set: { status: 'read', readAt: new Date() } });
            item.status = 'read';
            item.readAt = new Date();
        }
        res.json((0, response_1.createResponse)(serializeMessage(item)));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', (0, validate_1.validate)(createMessageSchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        const userId = req.user?.userId;
        const body = req.body;
        if ((0, inputSecurity_1.isSuspiciousInput)(body.message) || (0, inputSecurity_1.isSuspiciousInput)(body.subject)) {
            await auditMessage(userId ?? null, 'MESSAGE_SUSPICIOUS_INPUT', String(userId), { role });
            return res.status(400).json((0, response_1.createError)('Message contains unsupported content'));
        }
        let messageType = 'support';
        let category = body.category || 'support';
        let recipientId = body.recipientId ?? null;
        let recipientRole = body.recipientRole || '';
        let targetGroup = body.targetGroup || '';
        let studentDocId = body.studentId ?? null;
        let teacherId = body.teacherId ?? null;
        let branchId = req.user?.branchId ?? null;
        if (role === 'student') {
            const context = await (0, studentScope_1.resolveStudentContext)(req);
            if (!context)
                return res.status(403).json((0, response_1.createError)('Student profile not found'));
            studentDocId = context.studentDocId;
            teacherId = context.teacherId;
            branchId = context.branchId;
            if (targetGroup === 'admin' || body.recipientRole === 'admin') {
                messageType = 'student_to_admin';
                category = 'student';
                targetGroup = 'admin';
                recipientRole = 'admin';
            }
            else {
                messageType = 'student_to_teacher';
                category = 'student';
                recipientId = context.teacherId;
                recipientRole = 'teacher';
            }
        }
        else if (role === 'teacher') {
            messageType = 'teacher_to_admin';
            category = 'teacher';
            targetGroup = 'admin';
            recipientRole = 'admin';
            teacherId = userId;
        }
        else if (['super_admin', 'admin', 'branch_manager'].includes(String(role))) {
            if (body.studentId) {
                messageType = 'admin_to_student';
                category = body.category || 'academic';
                const student = await Student_1.Student.findById(body.studentId).select('teacherId branchId studentId').lean();
                if (!student)
                    return res.status(404).json((0, response_1.createError)('Student not found'));
                studentDocId = student._id;
                teacherId = student.teacherId;
                branchId = student.branchId ?? branchId;
                const studentUser = await User_1.User.findOne({ role: 'student', studentId: student.studentId, isDeleted: false }).select('_id').lean();
                recipientId = studentUser?._id ?? null;
                recipientRole = 'student';
            }
            else if (body.teacherId || body.recipientId) {
                messageType = 'admin_to_teacher';
                category = body.category || 'academic';
                teacherId = body.teacherId || body.recipientId;
                recipientId = teacherId;
                recipientRole = 'teacher';
            }
            else {
                return res.status(400).json((0, response_1.createError)('Recipient is required'));
            }
        }
        else {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const item = await Message_1.Message.create({
            senderId: userId,
            senderRole: role,
            recipientId,
            recipientRole,
            targetGroup,
            studentId: studentDocId,
            teacherId,
            branchId,
            subject: (0, inputSecurity_1.sanitizePlainText)(body.subject, 200),
            body: (0, inputSecurity_1.sanitizePlainText)(body.message, 5000),
            category,
            messageType,
            status: 'unread',
            priority: body.priority || 'normal'
        });
        res.status(201).json((0, response_1.createResponse)(serializeMessage(item.toObject()), 'Message sent successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.post('/:id/reply', (0, validate_1.validate)(replySchema), async (req, res, next) => {
    try {
        const parentMessage = await Message_1.Message.findOne({ _id: req.params.id, isDeleted: false }).lean();
        if (!parentMessage || !(await assertMessageAccess(req, parentMessage))) {
            return res.status(404).json((0, response_1.createError)('Message not found'));
        }
        const role = req.user?.canonicalRole ?? req.user?.role;
        const userId = req.user?.userId;
        const canAdminReply = ['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role));
        const canTeacherReply = role === 'teacher' && String(parentMessage.teacherId ?? '') === String(userId);
        if (!canAdminReply && !canTeacherReply) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const reply = await Message_1.Message.create({
            senderId: userId,
            senderRole: role,
            recipientId: parentMessage.senderId,
            recipientRole: parentMessage.senderRole,
            studentId: parentMessage.studentId,
            teacherId: parentMessage.teacherId,
            branchId: parentMessage.branchId,
            subject: `Re: ${parentMessage.subject || 'Message'}`,
            body: (0, inputSecurity_1.sanitizePlainText)(req.body.message, 5000),
            category: parentMessage.category,
            messageType: canAdminReply
                ? (String(parentMessage.messageType).includes('student') ? 'admin_to_student' : 'admin_to_teacher')
                : 'teacher_to_admin',
            status: 'unread',
            priority: req.body.priority || parentMessage.priority || 'normal',
            parentMessageId: parentMessage._id,
            threadId: parentMessage.threadId || parentMessage._id
        });
        await Message_1.Message.findByIdAndUpdate(parentMessage._id, {
            status: 'replied',
            repliedAt: new Date(),
            readAt: parentMessage.readAt || new Date()
        });
        await auditMessage(userId ?? null, 'MESSAGE_REPLY', String(parentMessage._id), { replyId: reply._id });
        res.status(201).json((0, response_1.createResponse)(serializeMessage(reply.toObject()), 'Reply sent successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id/read', (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const item = await Message_1.Message.findOne({ _id: req.params.id, isDeleted: false }).lean();
        if (!item || !(await assertMessageAccess(req, item))) {
            return res.status(404).json((0, response_1.createError)('Message not found'));
        }
        const updated = await Message_1.Message.findByIdAndUpdate(req.params.id, { status: item.status === 'unread' ? 'read' : item.status, readAt: new Date() }, { new: true }).lean();
        if (!updated) {
            return res.status(404).json((0, response_1.createError)('Message not found'));
        }
        res.json((0, response_1.createResponse)(serializeMessage(updated), 'Message marked as read'));
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id/close', (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const item = await Message_1.Message.findOne({ _id: req.params.id, isDeleted: false }).lean();
        if (!item || !(await assertMessageAccess(req, item))) {
            return res.status(404).json((0, response_1.createError)('Message not found'));
        }
        const updated = await Message_1.Message.findByIdAndUpdate(req.params.id, { status: 'closed', closedAt: new Date(), readAt: item.readAt || new Date() }, { new: true }).lean();
        await auditMessage(req.user?.userId ?? null, 'MESSAGE_CLOSE', String(item._id), { status: 'closed' });
        res.json((0, response_1.createResponse)(serializeMessage(updated), 'Message closed'));
    }
    catch (error) {
        next(error);
    }
});
exports.messagesRouter = router;
