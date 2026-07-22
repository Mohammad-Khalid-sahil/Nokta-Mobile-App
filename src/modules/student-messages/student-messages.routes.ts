import { Router } from 'express';
import Joi from 'joi';
import { StudentMessage } from '../../models/StudentMessage';
import { User } from '../../models/User';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';

const router = Router();

const viewMessages = authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent']);
const sendMessages = authorize(['student', 'family_student', 'parent', 'super_admin', 'admin', 'branch_manager']);

const createMessageSchema = Joi.object({
  body: Joi.object({
    teacherId: Joi.string().hex().length(24).allow('', null).optional(),
    studentId: Joi.string().hex().length(24).allow('', null).optional(),
    subject: Joi.string().trim().max(120).allow('', null).optional(),
    message: Joi.string().trim().min(2).max(2000).required()
  })
});
const messageQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().allow('', null),
  teacherId: Joi.string().hex().length(24).optional(),
  studentId: Joi.string().hex().length(24).optional()
});

function digitsOnly(value?: string) {
  return String(value || '').replace(/\D/g, '');
}

function whatsappLinkFor(user: any) {
  const phone = digitsOnly(user?.whatsapp || user?.phone);
  return phone ? `https://wa.me/${phone}` : '';
}

function serializeTeacher(user: any) {
  return {
    _id: user?._id ?? null,
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    whatsapp: user?.whatsapp ?? '',
    whatsappLink: whatsappLinkFor(user)
  };
}

function serializeMessage(item: any) {
  const studentRef = item?.studentId;
  const teacherRef = item?.teacherId;
  return {
    ...item,
    studentId: studentRef?._id ?? studentRef ?? null,
    teacherId: teacherRef?._id ?? teacherRef ?? null,
    studentName: studentRef?.name ?? '',
    teacherName: teacherRef?.name ?? '',
    whatsappLink: item?.whatsappLink || whatsappLinkFor(teacherRef)
  };
}

async function resolveStudentAndTeacher(req: any, body: Record<string, any>) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  const studentId = role === 'student' || role === 'family_student' ? req.user.userId : body.studentId;
  const student = await User.findOne({ _id: studentId, role: 'student', isDeleted: false })
    .select('name email phone whatsapp assignedTeacherId branchId familyId')
    .lean<any>();
  if (!student) throw new Error('Student account was not found');

  const teacherId = body.teacherId || student.assignedTeacherId;
  const teacher = await User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false })
    .select('name email phone whatsapp')
    .lean<any>();
  if (!teacher) throw new Error('Teacher account was not found');

  return { student, teacher };
}

router.use(authenticate);

router.get('/my-teacher', viewMessages, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user?.userId).select('assignedTeacherId').lean<any>();
    const teacher = currentUser?.assignedTeacherId
      ? await User.findOne({ _id: currentUser.assignedTeacherId, role: 'teacher', isDeleted: false }).select('name email phone whatsapp').lean<any>()
      : null;
    res.json(createResponse(teacher ? serializeTeacher(teacher) : null));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to load teacher contact'));
  }
});

router.get('/', viewMessages, validate(messageQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const role = req.user?.canonicalRole ?? req.user?.role;
    const filter: any = { isDeleted: false };

    if (role === 'teacher') filter.teacherId = req.user?.userId;
    if (role === 'student' || role === 'family_student') filter.studentId = req.user?.userId;
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    if (req.query.studentId) filter.studentId = req.query.studentId;

    const [items, total] = await Promise.all([
      StudentMessage.find(filter)
        .populate('studentId', 'name email phone')
        .populate('teacherId', 'name email phone whatsapp')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StudentMessage.countDocuments(filter)
    ]);

    res.json(createResponse(items.map(serializeMessage), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.post('/', sendMessages, validate(createMessageSchema), async (req, res) => {
  try {
    const { student, teacher } = await resolveStudentAndTeacher(req, req.body);
    const item = await StudentMessage.create({
      branchId: student.branchId ?? req.user?.branchId ?? null,
      studentId: student._id,
      teacherId: teacher._id,
      subject: req.body.subject || '',
      message: req.body.message,
      whatsappLink: whatsappLinkFor(teacher)
    });
    const saved = await StudentMessage.findById(item._id).populate('studentId', 'name email phone').populate('teacherId', 'name email phone whatsapp').lean();
    res.status(201).json(createResponse(serializeMessage(saved), 'Message sent successfully'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to send message'));
  }
});

export const studentMessagesRouter = router;
