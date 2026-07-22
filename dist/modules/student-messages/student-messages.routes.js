"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentMessagesRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const StudentMessage_1 = require("../../models/StudentMessage");
const User_1 = require("../../models/User");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const router = (0, express_1.Router)();
const viewMessages = (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent']);
const sendMessages = (0, auth_1.authorize)(['student', 'family_student', 'parent', 'super_admin', 'admin', 'branch_manager']);
const createMessageSchema = joi_1.default.object({
    body: joi_1.default.object({
        teacherId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        studentId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        subject: joi_1.default.string().trim().max(120).allow('', null).optional(),
        message: joi_1.default.string().trim().min(2).max(2000).required()
    })
});
const messageQuerySchema = joi_1.default.object({
    page: joi_1.default.number().integer().min(1).default(1),
    limit: joi_1.default.number().integer().min(1).max(100).default(20),
    search: joi_1.default.string().allow('', null),
    teacherId: joi_1.default.string().hex().length(24).optional(),
    studentId: joi_1.default.string().hex().length(24).optional()
});
function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
}
function whatsappLinkFor(user) {
    const phone = digitsOnly(user?.whatsapp || user?.phone);
    return phone ? `https://wa.me/${phone}` : '';
}
function serializeTeacher(user) {
    return {
        _id: user?._id ?? null,
        name: user?.name ?? '',
        email: user?.email ?? '',
        phone: user?.phone ?? '',
        whatsapp: user?.whatsapp ?? '',
        whatsappLink: whatsappLinkFor(user)
    };
}
function serializeMessage(item) {
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
async function resolveStudentAndTeacher(req, body) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    const studentId = role === 'student' || role === 'family_student' ? req.user.userId : body.studentId;
    const student = await User_1.User.findOne({ _id: studentId, role: 'student', isDeleted: false })
        .select('name email phone whatsapp assignedTeacherId branchId familyId')
        .lean();
    if (!student)
        throw new Error('Student account was not found');
    const teacherId = body.teacherId || student.assignedTeacherId;
    const teacher = await User_1.User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false })
        .select('name email phone whatsapp')
        .lean();
    if (!teacher)
        throw new Error('Teacher account was not found');
    return { student, teacher };
}
router.use(auth_1.authenticate);
router.get('/my-teacher', viewMessages, async (req, res) => {
    try {
        const currentUser = await User_1.User.findById(req.user?.userId).select('assignedTeacherId').lean();
        const teacher = currentUser?.assignedTeacherId
            ? await User_1.User.findOne({ _id: currentUser.assignedTeacherId, role: 'teacher', isDeleted: false }).select('name email phone whatsapp').lean()
            : null;
        res.json((0, response_1.createResponse)(teacher ? serializeTeacher(teacher) : null));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to load teacher contact'));
    }
});
router.get('/', viewMessages, (0, validate_1.validate)(messageQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const role = req.user?.canonicalRole ?? req.user?.role;
        const filter = { isDeleted: false };
        if (role === 'teacher')
            filter.teacherId = req.user?.userId;
        if (role === 'student' || role === 'family_student')
            filter.studentId = req.user?.userId;
        if (req.query.teacherId)
            filter.teacherId = req.query.teacherId;
        if (req.query.studentId)
            filter.studentId = req.query.studentId;
        const [items, total] = await Promise.all([
            StudentMessage_1.StudentMessage.find(filter)
                .populate('studentId', 'name email phone')
                .populate('teacherId', 'name email phone whatsapp')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            StudentMessage_1.StudentMessage.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(items.map(serializeMessage), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', sendMessages, (0, validate_1.validate)(createMessageSchema), async (req, res) => {
    try {
        const { student, teacher } = await resolveStudentAndTeacher(req, req.body);
        const item = await StudentMessage_1.StudentMessage.create({
            branchId: student.branchId ?? req.user?.branchId ?? null,
            studentId: student._id,
            teacherId: teacher._id,
            subject: req.body.subject || '',
            message: req.body.message,
            whatsappLink: whatsappLinkFor(teacher)
        });
        const saved = await StudentMessage_1.StudentMessage.findById(item._id).populate('studentId', 'name email phone').populate('teacherId', 'name email phone whatsapp').lean();
        res.status(201).json((0, response_1.createResponse)(serializeMessage(saved), 'Message sent successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to send message'));
    }
});
exports.studentMessagesRouter = router;
