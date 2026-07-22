import { Router } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { Message } from '../../models/Message';
import { User } from '../../models/User';
import { Student } from '../../models/Student';
import { ParentProfile } from '../../models/Parent';
import { AuditLog } from '../../models/AuditLog';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { isSuspiciousInput, sanitizePlainText } from '../../utils/inputSecurity';
import { publicContactLimiter } from '../../middlewares/rateLimiter';
import { resolveStudentContext, resolveStudentRecordForUser } from '../../utils/studentScope';

const router = Router();

const messageQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    category: Joi.string().valid('student', 'teacher', 'customer', 'support', 'academic', 'finance').optional(),
    status: Joi.string().valid('unread', 'read', 'replied', 'closed').optional(),
    priority: Joi.string().valid('low', 'normal', 'high').optional(),
    search: Joi.string().allow('', null).optional(),
    from: Joi.date().optional(),
    to: Joi.date().optional()
  })
});

const createMessageSchema = Joi.object({
  body: Joi.object({
    recipientId: Joi.string().hex().length(24).allow(null).optional(),
    recipientRole: Joi.string().trim().max(40).allow('', null).optional(),
    targetGroup: Joi.string().valid('admin', 'super_admin', 'teacher', 'student').optional(),
    teacherId: Joi.string().hex().length(24).allow(null).optional(),
    studentId: Joi.string().hex().length(24).allow(null).optional(),
    classId: Joi.string().hex().length(24).allow(null).optional(),
    subject: Joi.string().trim().max(200).allow('', null).optional(),
    message: Joi.string().trim().min(2).max(5000).required(),
    category: Joi.string().valid('student', 'teacher', 'customer', 'support', 'academic', 'finance').optional(),
    priority: Joi.string().valid('low', 'normal', 'high').optional()
  })
});

const publicContactSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    email: Joi.string().trim().max(160).allow('', null).optional().custom((value, helpers) => {
      const normalized = String(value ?? '').trim();
      if (!normalized) return normalized;
      const { error } = Joi.string().email({ tlds: { allow: false } }).validate(normalized);
      if (error) return helpers.error('string.email');
      return normalized;
    }),
    phone: Joi.string().trim().max(40).allow('', null).optional(),
    subject: Joi.string().trim().max(200).allow('', null).optional(),
    message: Joi.string().trim().min(4).max(2000).required()
  }).custom((value, helpers) => {
    const email = String(value?.email ?? '').trim();
    const phone = String(value?.phone ?? '').trim();
    if (!email && !phone) {
      return helpers.error('any.custom', { message: 'Email or phone is required' });
    }
    return value;
  })
});

const idParamsSchema = Joi.object({
  params: Joi.object({ id: Joi.string().hex().length(24).required() })
});

const replySchema = Joi.object({
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    message: Joi.string().trim().min(2).max(5000).required(),
    priority: Joi.string().valid('low', 'normal', 'high').optional()
  })
});

function serializeMessage(item: any) {
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

async function auditMessage(actorId: string | null, action: string, target: string, metadata: Record<string, unknown> = {}) {
  if (!actorId) return;
  await AuditLog.create({
    actor: actorId,
    action,
    target,
    targetType: 'message',
    metadata,
    severity: action.includes('SUSPICIOUS') ? 'warning' : 'info'
  });
}

function buildRoleFilter(req: any, mode: 'inbox' | 'sent' | 'admin') {
  const role = req.user?.canonicalRole ?? req.user?.role;
  const userId = req.user?.userId;
  const branchId = req.user?.branchId;
  const filter: Record<string, any> = { isDeleted: false };

  if (role === 'branch_manager' && branchId && mode === 'admin') {
    filter.$or = [{ branchId }, { branchId: null, category: 'customer' }];
  }

  if (['super_admin', 'admin'].includes(String(role)) && mode === 'admin') {
    return filter;
  }

  if (role === 'teacher') {
    if (mode === 'sent') {
      filter.senderId = userId;
    } else {
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
  } else {
    filter.recipientId = userId;
  }

  return filter;
}

async function applyParentScope(req: any, filter: Record<string, any>) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  if (role !== 'parent' && role !== 'family_student') return filter;

  const currentUser = await User.findById(req.user?.userId).select('familyId parentProfileId').lean<Record<string, any>>();
  const familyStudents = await Student.find({
    isDeleted: false,
    ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
    ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
  }).select('_id').lean();

  const studentIds = familyStudents.map((student) => student._id);
  filter.studentId = { $in: studentIds };
  return filter;
}

function applyQueryFilters(filter: Record<string, any>, query: Record<string, any>) {
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.search) {
    const search = sanitizePlainText(query.search, 120);
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
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  return filter;
}

async function assertMessageAccess(req: any, message: any) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  const userId = String(req.user?.userId ?? '');

  if (['super_admin', 'admin', 'owner'].includes(String(role))) return true;
  if (role === 'branch_manager' && req.user?.branchId && String(message.branchId ?? '') === String(req.user.branchId)) return true;

  if (role === 'teacher') {
    return String(message.teacherId ?? '') === userId
      || String(message.senderId ?? '') === userId
      || String(message.recipientId ?? '') === userId;
  }

  if (role === 'student') {
    return String(message.senderId ?? '') === userId || String(message.recipientId ?? '') === userId;
  }

  if (role === 'parent' || role === 'family_student') {
    const currentUser = await User.findById(userId).select('familyId parentProfileId').lean<Record<string, any>>();
    const familyStudents = await Student.find({
      isDeleted: false,
      ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
      ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
    }).select('_id').lean();
    const allowed = new Set(familyStudents.map((student) => String(student._id)));
    return allowed.has(String(message.studentId ?? ''));
  }

  return false;
}

function shouldMarkAsReadOnOpen(req: any, message: Record<string, any>) {
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

router.post('/public-contact', publicContactLimiter, validate(publicContactSchema), async (req, res) => {
  try {
    const payload = req.body;
    const combined = `${payload.name} ${payload.email ?? ''} ${payload.phone ?? ''} ${payload.subject ?? ''} ${payload.message}`;
    if (isSuspiciousInput(combined)) {
      await auditMessage(null, 'MESSAGE_PUBLIC_SUSPICIOUS', 'public-contact', { ip: req.ip, email: payload.email });
      return res.status(400).json(createError('Message contains unsupported content'));
    }

    const item = await Message.create({
      senderRole: 'visitor',
      senderName: sanitizePlainText(payload.name, 120),
      senderEmail: payload.email ? sanitizePlainText(payload.email, 160).toLowerCase() : '',
      senderPhone: sanitizePlainText(payload.phone, 40),
      recipientRole: 'admin',
      targetGroup: 'admin',
      subject: sanitizePlainText(payload.subject, 200) || 'تماس از صفحه اصلی',
      body: sanitizePlainText(payload.message, 2000),
      category: 'customer',
      messageType: 'public_contact',
      status: 'unread',
      priority: 'normal'
    });

    res.status(201).json(createResponse(serializeMessage(item.toObject()), 'پیام شما دریافت شد. به زودی پاسخ می‌دهیم.'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to send message'));
  }
});

router.use(authenticate);

router.get('/admin/summary', validate(messageQuerySchema), async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
      return res.status(403).json(createError('Forbidden'));
    }

    let filter = buildRoleFilter(req, 'admin');
    filter = await applyParentScope(req, filter);

    const [total, unread, students, teachers, customers, replied, closed, highPriority] = await Promise.all([
      Message.countDocuments(filter),
      Message.countDocuments({ ...filter, status: 'unread' }),
      Message.countDocuments({ ...filter, category: 'student' }),
      Message.countDocuments({ ...filter, category: 'teacher' }),
      Message.countDocuments({ ...filter, category: 'customer' }),
      Message.countDocuments({ ...filter, status: 'replied' }),
      Message.countDocuments({ ...filter, status: 'closed' }),
      Message.countDocuments({ ...filter, priority: 'high' })
    ]);

    res.json(createResponse({ total, unread, students, teachers, customers, replied, closed, highPriority }));
  } catch (error) {
    next(error);
  }
});

router.get('/admin/inbox', validate(messageQuerySchema), async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
      return res.status(403).json(createError('Forbidden'));
    }

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    let filter = buildRoleFilter(req, 'admin');
    filter = await applyParentScope(req, filter);
    filter = applyQueryFilters(filter, req.query);

    const [items, total] = await Promise.all([
      Message.find(filter)
        .populate('senderId', 'name email role')
        .populate('recipientId', 'name email role')
        .populate('studentId', 'firstName lastName studentId')
        .populate('teacherId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter)
    ]);

    res.json(createResponse(items.map(serializeMessage), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/inbox', validate(messageQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    let filter = buildRoleFilter(req, 'inbox');
    filter = await applyParentScope(req, filter);
    filter = applyQueryFilters(filter, req.query);

    const [items, total] = await Promise.all([
      Message.find(filter)
        .populate('senderId', 'name email role')
        .populate('recipientId', 'name email role')
        .populate('studentId', 'firstName lastName studentId')
        .populate('teacherId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter)
    ]);

    res.json(createResponse(items.map(serializeMessage), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/sent', validate(messageQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    let filter = buildRoleFilter(req, 'sent');
    filter = await applyParentScope(req, filter);
    filter = applyQueryFilters(filter, req.query);

    const [items, total] = await Promise.all([
      Message.find(filter)
        .populate('senderId', 'name email role')
        .populate('recipientId', 'name email role')
        .populate('studentId', 'firstName lastName studentId')
        .populate('teacherId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter)
    ]);

    res.json(createResponse(items.map(serializeMessage), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    let filter = buildRoleFilter(req, 'inbox');
    filter = await applyParentScope(req, filter);
    filter.status = 'unread';
    const unreadCount = await Message.countDocuments(filter);
    res.json(createResponse({ unreadCount }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', validate(idParamsSchema), async (req, res, next) => {
  try {
    const item = await Message.findOne({ _id: req.params.id, isDeleted: false })
      .populate('senderId', 'name email role')
      .populate('recipientId', 'name email role')
      .populate('studentId', 'firstName lastName studentId')
      .populate('teacherId', 'name email')
      .lean<Record<string, any>>();

    if (!item || !(await assertMessageAccess(req, item))) {
      return res.status(404).json(createError('Message not found'));
    }

    if (shouldMarkAsReadOnOpen(req, item)) {
      await Message.updateOne({ _id: item._id }, { $set: { status: 'read', readAt: new Date() } });
      item.status = 'read';
      item.readAt = new Date();
    }

    res.json(createResponse(serializeMessage(item)));
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(createMessageSchema), async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole ?? req.user?.role;
    const userId = req.user?.userId;
    const body = req.body;

    if (isSuspiciousInput(body.message) || isSuspiciousInput(body.subject)) {
      await auditMessage(userId ?? null, 'MESSAGE_SUSPICIOUS_INPUT', String(userId), { role });
      return res.status(400).json(createError('Message contains unsupported content'));
    }

    let messageType = 'support';
    let category = body.category || 'support';
    let recipientId = body.recipientId ?? null;
    let recipientRole = body.recipientRole || '';
    let targetGroup = body.targetGroup || '';
    let studentDocId = body.studentId ?? null;
    let teacherId = body.teacherId ?? null;
    let branchId = req.user?.branchId ?? null;
    let threadId: mongoose.Types.ObjectId | string | null = null;

    if (role === 'student') {
      const context = await resolveStudentContext(req);
      if (!context) return res.status(403).json(createError('Student profile not found'));
      studentDocId = context.studentDocId;
      teacherId = context.teacherId;
      branchId = context.branchId;

      if (targetGroup === 'admin' || body.recipientRole === 'admin') {
        messageType = 'student_to_admin';
        category = 'student';
        targetGroup = 'admin';
        recipientRole = 'admin';
      } else {
        messageType = 'student_to_teacher';
        category = 'student';
        recipientId = context.teacherId;
        recipientRole = 'teacher';
      }
    } else if (role === 'teacher') {
      category = body.category || 'teacher';
      teacherId = userId;
      const requestedRecipientId = body.recipientId ?? body.receiverId ?? null;
      const requestedRecipientRole = body.recipientRole ?? body.receiverRole ?? '';

      if (requestedRecipientRole === 'student' && body.studentId) {
        const student = await Student.findOne({
          _id: body.studentId,
          teacherId: userId,
          isDeleted: false
        }).select('_id branchId classId studentId loginEmail').lean<Record<string, any>>();
        if (!student) return res.status(403).json(createError('Student is not assigned to this teacher'));

        const studentUser = await User.findOne({
          role: 'student',
          isDeleted: false,
          $or: [
            requestedRecipientId ? { _id: requestedRecipientId } : { _id: null },
            student.studentId ? { studentId: student.studentId } : { _id: null },
            student.loginEmail ? { email: student.loginEmail } : { _id: null }
          ]
        }).select('_id').lean<Record<string, any>>();
        if (!studentUser?._id) {
          return res.status(404).json(createError('Student account was not found'));
        }

        const existingThread = await Message.findOne({
          isDeleted: false,
          $or: [
            { senderId: userId, recipientId: studentUser._id },
            { senderId: studentUser._id, recipientId: userId }
          ]
        })
          .sort({ createdAt: -1 })
          .select('threadId _id')
          .lean<Record<string, any>>();

        messageType = 'teacher_to_student';
        category = body.category === 'student' ? 'student' : 'academic';
        recipientId = studentUser._id;
        recipientRole = 'student';
        studentDocId = student._id;
        branchId = student.branchId ?? branchId;
        threadId = existingThread?.threadId ?? existingThread?._id ?? null;
      } else if (body.recipientRole === 'parent' && body.recipientId && body.studentId) {
        const student = await Student.findOne({
          _id: body.studentId,
          teacherId: userId,
          isDeleted: false
        }).select('_id branchId parentProfileId').lean<Record<string, any>>();
        if (!student) return res.status(403).json(createError('Parent is not linked to your students'));

        const parent = await ParentProfile.findOne({
          userId: body.recipientId,
          isDeleted: false,
          $or: [
            { _id: student.parentProfileId },
            { linkedStudentIds: student._id }
          ]
        }).select('_id userId').lean<Record<string, any>>();
        if (!parent) return res.status(403).json(createError('Parent is not linked to your students'));

        messageType = 'teacher_to_parent';
        recipientId = parent.userId;
        recipientRole = 'parent';
        studentDocId = student._id;
        branchId = student.branchId ?? branchId;
      } else {
        messageType = 'teacher_to_admin';
        targetGroup = 'admin';
        recipientRole = 'admin';
      }
    } else if (['super_admin', 'admin', 'branch_manager'].includes(String(role))) {
      if (body.studentId) {
        messageType = 'admin_to_student';
        category = body.category || 'academic';
        const student = await Student.findById(body.studentId).select('teacherId branchId studentId').lean<Record<string, any>>();
        if (!student) return res.status(404).json(createError('Student not found'));
        studentDocId = student._id;
        teacherId = student.teacherId;
        branchId = student.branchId ?? branchId;
        const studentUser = await User.findOne({ role: 'student', studentId: student.studentId, isDeleted: false }).select('_id').lean<Record<string, any>>();
        recipientId = studentUser?._id ?? null;
        recipientRole = 'student';
      } else if (body.teacherId || body.recipientId) {
        messageType = 'admin_to_teacher';
        category = body.category || 'academic';
        teacherId = body.teacherId || body.recipientId;
        recipientId = teacherId;
        recipientRole = 'teacher';
      } else {
        return res.status(400).json(createError('Recipient is required'));
      }
    } else {
      return res.status(403).json(createError('Forbidden'));
    }

    const item = await Message.create({
      senderId: userId,
      senderRole: role,
      recipientId,
      recipientRole,
      targetGroup,
      studentId: studentDocId,
      teacherId,
      branchId,
      classId: body.classId ?? null,
      subject: sanitizePlainText(body.subject, 200),
      body: sanitizePlainText(body.message, 5000),
      category,
      messageType,
      threadId,
      status: 'unread',
      priority: body.priority || 'normal'
    });

    res.status(201).json(createResponse(serializeMessage(item.toObject()), 'Message sent successfully'));
  } catch (error: any) {
    next(error);
  }
});

router.post('/:id/reply', validate(replySchema), async (req, res, next) => {
  try {
    const parentMessage = await Message.findOne({ _id: req.params.id, isDeleted: false }).lean<Record<string, any>>();
    if (!parentMessage || !(await assertMessageAccess(req, parentMessage))) {
      return res.status(404).json(createError('Message not found'));
    }

    const role = req.user?.canonicalRole ?? req.user?.role;
    const userId = req.user?.userId;
    const canAdminReply = ['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role));
    const canTeacherReply = role === 'teacher' && String(parentMessage.teacherId ?? '') === String(userId);
    if (!canAdminReply && !canTeacherReply) {
      return res.status(403).json(createError('Forbidden'));
    }

    const reply = await Message.create({
      senderId: userId,
      senderRole: role,
      recipientId: parentMessage.senderId,
      recipientRole: parentMessage.senderRole,
      studentId: parentMessage.studentId,
      teacherId: parentMessage.teacherId,
      branchId: parentMessage.branchId,
      subject: `Re: ${parentMessage.subject || 'Message'}`,
      body: sanitizePlainText(req.body.message, 5000),
      category: parentMessage.category,
      messageType: canAdminReply
        ? (String(parentMessage.messageType).includes('student') ? 'admin_to_student' : 'admin_to_teacher')
        : 'teacher_to_admin',
      status: 'unread',
      priority: req.body.priority || parentMessage.priority || 'normal',
      parentMessageId: parentMessage._id,
      threadId: parentMessage.threadId || parentMessage._id
    });

    await Message.findByIdAndUpdate(parentMessage._id, {
      status: 'replied',
      repliedAt: new Date(),
      readAt: parentMessage.readAt || new Date()
    });

    await auditMessage(userId ?? null, 'MESSAGE_REPLY', String(parentMessage._id), { replyId: reply._id });

    res.status(201).json(createResponse(serializeMessage(reply.toObject()), 'Reply sent successfully'));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', validate(idParamsSchema), async (req, res, next) => {
  try {
    const item = await Message.findOne({ _id: req.params.id, isDeleted: false }).lean<Record<string, any>>();
    if (!item || !(await assertMessageAccess(req, item))) {
      return res.status(404).json(createError('Message not found'));
    }

    const updated = await Message.findByIdAndUpdate(
      req.params.id,
      { status: item.status === 'unread' ? 'read' : item.status, readAt: new Date() },
      { new: true }
    ).lean<Record<string, any>>();

    if (!updated) {
      return res.status(404).json(createError('Message not found'));
    }

    res.json(createResponse(serializeMessage(updated), 'Message marked as read'));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/close', validate(idParamsSchema), async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
      return res.status(403).json(createError('Forbidden'));
    }

    const item = await Message.findOne({ _id: req.params.id, isDeleted: false }).lean<Record<string, any>>();
    if (!item || !(await assertMessageAccess(req, item))) {
      return res.status(404).json(createError('Message not found'));
    }

    const updated = await Message.findByIdAndUpdate(
      req.params.id,
      { status: 'closed', closedAt: new Date(), readAt: item.readAt || new Date() },
      { new: true }
    ).lean<Record<string, any>>();

    await auditMessage(req.user?.userId ?? null, 'MESSAGE_CLOSE', String(item._id), { status: 'closed' });

    res.json(createResponse(serializeMessage(updated), 'Message closed'));
  } catch (error) {
    next(error);
  }
});

export const messagesRouter = router;
