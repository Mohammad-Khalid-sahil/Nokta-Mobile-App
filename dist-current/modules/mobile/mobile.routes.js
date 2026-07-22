"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mobileRouter = void 0;
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const Attendance_1 = require("../../models/Attendance");
const Class_1 = require("../../models/Class");
const Exam_1 = require("../../models/Exam");
const Family_1 = require("../../models/Family");
const Message_1 = require("../../models/Message");
const Notification_1 = require("../../models/Notification");
const Parent_1 = require("../../models/Parent");
const Payment_1 = require("../../models/Payment");
const Result_1 = require("../../models/Result");
const Salary_1 = require("../../models/Salary");
const Student_1 = require("../../models/Student");
const Subject_1 = require("../../models/Subject");
const TeacherRating_1 = require("../../models/TeacherRating");
const Teacher_1 = require("../../models/Teacher");
const User_1 = require("../../models/User");
const localizedText_1 = require("../../utils/localizedText");
const studentScope_1 = require("../../utils/studentScope");
exports.mobileRouter = (0, express_1.Router)();
const maxItems = 100;
const websiteApiMap = [
    { path: '/dashboard', endpoint: '/api/dashboard/summary', methods: ['GET'] },
    { path: '/academic-standards', endpoint: '/api/reports/academic-standards', methods: ['GET'], fallback: '/api/reports' },
    { path: '/enterprise', endpoint: '/api/admin/enterprise', methods: ['GET'], fallback: '/api/dashboard/summary' },
    { path: '/branches', endpoint: '/api/branches', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/users', endpoint: '/api/users', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/students', endpoint: '/api/students', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/teachers', endpoint: '/api/teachers', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/classes', endpoint: '/api/classes', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/timetable', endpoint: '/api/timetable', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/courses', endpoint: '/api/courses', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/subjects', endpoint: '/api/subjects', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/attendance', endpoint: '/api/attendance', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/exams', endpoint: '/api/exams', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/results', endpoint: '/api/results', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/payments', endpoint: '/api/payments', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/finance', endpoint: '/api/finance', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/expenses', endpoint: '/api/expenses', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/payroll', endpoint: '/api/payroll', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/academy-financial-report', endpoint: '/api/academy-financial-report', methods: ['GET'] },
    { path: '/reports', endpoint: '/api/reports', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/books', endpoint: '/api/books', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/messages', endpoint: '/api/messages', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/notifications', endpoint: '/api/notifications', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/curriculum', endpoint: '/api/curriculum', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/audit', endpoint: '/api/audit', methods: ['GET'] },
    { path: '/roles', endpoint: '/api/roles', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/permissions', endpoint: '/api/permissions', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/global-search', endpoint: '/api/search', methods: ['GET'] },
    { path: '/security-events', endpoint: '/api/observability/security-events', methods: ['GET'], fallback: '/api/audit' },
    { path: '/ai-assistant', endpoint: '/api/admin/ai-assistant', methods: ['GET', 'POST'], fallback: '/api/dashboard/summary' }
];
function ok(res, data) {
    return res.json({ success: true, data });
}
exports.mobileRouter.get('/api-map', (_req, res) => ok(res, {
    generatedAt: new Date().toISOString(),
    basePath: '/api',
    health: '/api/health',
    modules: websiteApiMap
}));
exports.mobileRouter.get('/admin/teacher-ratings', async (req, res, next) => {
    try {
        if (!requireAdminAccess(req, res))
            return;
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(maxItems, Math.max(1, Number(req.query.limit || 50)));
        const status = String(req.query.status || '').trim();
        const filter = {
            isDeleted: false,
            ...branchFilter(req)
        };
        if (status)
            filter.status = status;
        const [items, total] = await Promise.all([
            TeacherRating_1.TeacherRating.find(filter)
                .populate('studentId', 'firstName lastName studentId')
                .populate('studentUserId', 'name email')
                .populate('teacherId', 'name email')
                .populate('classId', 'className name')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            TeacherRating_1.TeacherRating.countDocuments(filter)
        ]);
        ok(res, {
            items: items.map((item) => ({
                id: String(item._id),
                studentName: item.studentId
                    ? `${item.studentId.firstName ?? ''} ${item.studentId.lastName ?? ''}`.trim()
                    : item.studentUserId?.name ?? 'Student',
                studentEmail: item.studentUserId?.email ?? '',
                teacherName: item.teacherId?.name ?? 'Teacher',
                teacherEmail: item.teacherId?.email ?? '',
                className: item.classId?.className ?? item.classId?.name ?? '',
                rating: Number(item.rating ?? 0),
                comment: item.comment ?? '',
                status: item.status ?? '',
                createdAt: compactDate(item.createdAt)
            })),
            page,
            limit,
            total
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.patch('/admin/teacher-ratings/:id', async (req, res, next) => {
    try {
        if (!requireAdminAccess(req, res))
            return;
        const status = String(req.body?.status ?? '').trim();
        if (!['pending_admin_review', 'reviewed', 'archived'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid rating status' });
        }
        const item = await TeacherRating_1.TeacherRating.findOneAndUpdate({ _id: req.params.id, isDeleted: false, ...branchFilter(req) }, { status }, { new: true }).lean();
        if (!item) {
            return res.status(404).json({ success: false, message: 'Rating not found' });
        }
        return ok(res, { id: String(item._id), status: item.status });
    }
    catch (error) {
        return next(error);
    }
});
exports.mobileRouter.get('/admin/student-registrations', async (req, res, next) => {
    try {
        if (!requireAdminAccess(req, res))
            return;
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(maxItems, Math.max(1, Number(req.query.limit || 50)));
        const filter = {
            isDeleted: false,
            ...branchFilter(req)
        };
        const [items, total] = await Promise.all([
            Student_1.Student.find(filter)
                .populate('classId', 'className name')
                .populate('subjectId', 'title name')
                .populate('teacherId', 'name email')
                .populate('parentProfileId', 'guardianName guardianEmail guardianPhone')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Student_1.Student.countDocuments(filter)
        ]);
        ok(res, {
            items: items.map((item) => ({
                id: String(item._id),
                studentId: item.studentId ?? '',
                studentName: `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
                fatherName: item.fatherName ?? '',
                familyPhone: item.familyPhone ?? '',
                familyEmail: item.familyEmail ?? '',
                className: item.classId?.className ?? item.classId?.name ?? '',
                subjectName: item.subjectId?.title ?? item.subjectId?.name ?? '',
                teacherName: item.teacherId?.name ?? '',
                parentName: item.parentProfileId?.guardianName ?? '',
                parentEmail: item.parentProfileId?.guardianEmail ?? '',
                parentPhone: item.parentProfileId?.guardianPhone ?? '',
                status: item.status ?? item.accountStatus ?? '',
                accountStatus: item.accountStatus ?? '',
                createdAt: compactDate(item.createdAt)
            })),
            page,
            limit,
            total
        });
    }
    catch (error) {
        next(error);
    }
});
function objectId(value) {
    const id = String(value ?? '');
    return mongoose_1.default.Types.ObjectId.isValid(id) ? new mongoose_1.default.Types.ObjectId(id) : null;
}
function compactDate(value) {
    if (!value)
        return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
function classSchedule(item) {
    const weekly = Array.isArray(item.weeklySchedule) ? item.weeklySchedule : [];
    if (!weekly.length)
        return 'Schedule pending';
    return weekly
        .map((slot) => `${slot.startTime ?? ''}-${slot.endTime ?? ''}`.trim())
        .filter(Boolean)
        .join(', ');
}
function classDto(item) {
    return {
        id: String(item._id ?? item.id ?? ''),
        _id: String(item._id ?? item.id ?? ''),
        name: item.name ?? item.className ?? item.title ?? 'Class',
        className: item.className ?? item.name ?? item.title ?? 'Class',
        room: item.room ?? '',
        schedule: item.schedule ?? classSchedule(item),
        studentCount: Number(item.studentCount ?? 0),
        students: Number(item.studentCount ?? 0),
        description: item.description ?? item.shortDescription ?? '',
        allowedGender: item.genderRestriction ?? 'coed',
        mode: item.mode ?? 'onsite',
        subject: item.subjectName ?? '',
        subjects: Array.isArray(item.assignedSubjects) ? item.assignedSubjects : []
    };
}
function messageDto(item) {
    return {
        id: String(item._id ?? item.id ?? ''),
        _id: String(item._id ?? item.id ?? ''),
        name: item.senderName || item.subject || 'Academy',
        role: item.senderRole || item.category || 'message',
        title: item.subject || 'Message',
        lastMessage: item.body || item.message || '',
        body: item.body || item.message || '',
        timeLabel: compactDate(item.createdAt),
        unreadCount: item.status === 'unread' ? 1 : 0
    };
}
function notificationDto(item) {
    const title = (0, localizedText_1.resolveLocalizedText)(item.title);
    const body = (0, localizedText_1.resolveLocalizedText)(item.message ?? item.description);
    return {
        id: String(item._id ?? item.id ?? ''),
        _id: String(item._id ?? item.id ?? ''),
        title,
        body,
        message: body,
        label: item.category ?? 'Announcement',
        type: item.category ?? 'general',
        timeLabel: compactDate(item.publishDate ?? item.createdAt)
    };
}
function chatMessageDto(item) {
    return {
        id: String(item._id ?? item.id ?? ''),
        _id: String(item._id ?? item.id ?? ''),
        threadId: String(item.threadId ?? item.parentMessageId ?? item._id ?? ''),
        senderId: String(item.senderId?._id ?? item.senderId ?? ''),
        senderName: item.senderName || item.senderId?.name || 'Student',
        senderRole: item.senderRole || '',
        recipientId: String(item.recipientId?._id ?? item.recipientId ?? ''),
        recipientName: item.recipientId?.name || '',
        body: item.body || item.message || '',
        subject: item.subject || '',
        status: item.status || 'unread',
        createdAt: compactDate(item.createdAt),
        isMine: false,
        messageType: item.messageType || '',
        attachments: Array.isArray(item.attachments) ? item.attachments : []
    };
}
async function currentUser(req) {
    if (!req.user?.userId)
        return null;
    return User_1.User.findById(req.user.userId).lean();
}
async function currentStudent(req) {
    const scope = await (0, studentScope_1.resolveStudentRecordForUser)(req.user?.userId);
    return scope?.student ?? null;
}
async function currentStudentContext(req) {
    const student = await currentStudent(req);
    if (!student || !req.user?.userId)
        return null;
    return {
        student,
        studentId: objectId(student._id),
        userId: objectId(req.user.userId),
        classId: objectId(student.classId),
        teacherId: objectId(student.teacherId),
        branchId: objectId(student.branchId)
    };
}
async function studentUserForStudentId(studentId) {
    const student = await Student_1.Student.findById(studentId).select('studentId loginEmail').lean();
    if (!student)
        return null;
    return User_1.User.findOne({
        role: 'student',
        isDeleted: false,
        $or: [
            student.studentId ? { studentId: student.studentId } : { _id: null },
            student.loginEmail ? { email: student.loginEmail } : { _id: null }
        ]
    }).select('name email role profileImage studentId').lean();
}
async function currentParent(req) {
    const user = await currentUser(req);
    if (!user)
        return null;
    return Parent_1.ParentProfile.findOne({
        $or: [
            { userId: user._id },
            user.parentProfileId ? { _id: user.parentProfileId } : { _id: null },
            user.familyId ? { linkedStudentIds: { $exists: true } } : { _id: null }
        ],
        isDeleted: false
    }).lean();
}
async function currentParentScope(req) {
    const user = await currentUser(req);
    const parent = await currentParent(req);
    let family = null;
    if (user?.familyId) {
        family = await Family_1.Family.findById(user.familyId).lean();
    }
    if (!family && parent?.guardianEmail) {
        family = await Family_1.Family.findOne({
            guardianEmail: parent.guardianEmail,
        }).lean();
    }
    if (!family && user?.email) {
        family = await Family_1.Family.findOne({
            guardianEmail: user.email,
        }).lean();
    }
    if (!family && user?.phone) {
        family = await Family_1.Family.findOne({
            guardianPhone: user.phone,
        }).lean();
    }
    if (!family && String(user?.role ?? '') === 'family_student') {
        const match = String(user?.email ?? '').match(/^family(\d+)@nokta\.com$/i);
        const index = match ? Math.max(0, Number(match[1]) - 1) : -1;
        if (index >= 0) {
            family = await Family_1.Family.findOne({}).sort({ createdAt: 1, _id: 1 }).skip(index).lean();
        }
    }
    const profileStudentIds = Array.isArray(parent?.linkedStudentIds)
        ? parent.linkedStudentIds
        : [];
    const familyStudentIds = Array.isArray(family?.students) ? family.students : [];
    const studentIds = Array.from(new Set([...profileStudentIds, ...familyStudentIds].map(String).filter(Boolean)))
        .map(objectId)
        .filter((id) => Boolean(id));
    return { user, parent, family, studentIds };
}
async function studentUserIdsForStudentRecords(studentIds) {
    if (!studentIds.length)
        return [];
    const students = await Student_1.Student.find({ _id: { $in: studentIds }, isDeleted: false })
        .select('studentId loginEmail')
        .lean();
    const studentNumbers = students.map((student) => student.studentId).filter(Boolean);
    const emails = students.map((student) => student.loginEmail).filter(Boolean);
    const users = await User_1.User.find({
        role: 'student',
        isDeleted: false,
        $or: [
            studentNumbers.length ? { studentId: { $in: studentNumbers } } : { _id: null },
            emails.length ? { email: { $in: emails } } : { _id: null }
        ]
    }).select('_id').lean();
    return users.map((user) => objectId(user._id)).filter((id) => Boolean(id));
}
async function currentTeacher(req) {
    if (!req.user?.userId)
        return null;
    return Teacher_1.TeacherProfile.findOne({ userId: req.user.userId, isDeleted: false }).lean();
}
async function teacherClassForRequest(req, classIdValue) {
    const classId = objectId(classIdValue);
    const teacherId = objectId(req.user?.userId);
    if (!classId || !teacherId)
        return null;
    return Class_1.ClassModel.findOne({
        _id: classId,
        isDeleted: false,
        $or: [{ teacherId }, { assignedTeachers: teacherId }]
    }).lean();
}
function parentDto(parent, student) {
    return {
        id: String(parent?._id ?? student.parentProfileId ?? ''),
        name: parent?.guardianName ?? 'Parent',
        role: 'parent',
        phone: parent?.guardianPhone ?? '',
        email: parent?.guardianEmail ?? ''
    };
}
function branchFilter(req) {
    return req.user?.branchId ? { branchId: req.user.branchId } : {};
}
function requireAdminAccess(req, res) {
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if (!['super_admin', 'admin', 'owner', 'branch_manager'].includes(role)) {
        res.status(403).json({ success: false, message: 'Admin access required' });
        return false;
    }
    return true;
}
exports.mobileRouter.get('/student/dashboard', async (req, res, next) => {
    try {
        const student = await currentStudent(req);
        const studentId = objectId(student?._id);
        const classId = objectId(student?.classId);
        const [classes, exams, attendanceCount, presentCount, notifications, payments] = await Promise.all([
            classId ? Class_1.ClassModel.find({ _id: classId, isDeleted: false }).select('className name title room weeklySchedule studentCount description shortDescription genderRestriction').lean() : Promise.resolve([]),
            classId ? Exam_1.Exam.find({ class: classId, isDeleted: false }).select('title date totalMarks status onlineExamUrl googleFormUrl examType').sort({ date: 1 }).limit(5).lean() : Promise.resolve([]),
            studentId ? Attendance_1.Attendance.countDocuments({ studentId, isDeleted: false }) : Promise.resolve(0),
            studentId ? Attendance_1.Attendance.countDocuments({ studentId, status: 'present', isDeleted: false }) : Promise.resolve(0),
            Notification_1.Notification.find({ publishStatus: 'published', isDeleted: false }).select('title message description category publishDate createdAt pinned').sort({ pinned: -1, publishDate: -1, createdAt: -1 }).limit(5).lean(),
            studentId ? Payment_1.Payment.find({ studentId, isDeleted: false }).select('amount status paymentDate invoiceNumber paymentFor').sort({ paymentDate: -1 }).limit(10).lean() : Promise.resolve([])
        ]);
        const pendingFeeAmount = Number(student?.remainingBalance ?? 0);
        ok(res, {
            attendancePercentage: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : 0,
            gpa: 0,
            gpaTrendPercentage: 0,
            gpaHistory: [],
            activeClasses: classes.length,
            upcomingExamCount: exams.length,
            unreadNotifications: notifications.length,
            pendingFeeAmount,
            upcomingClasses: classes.map(classDto),
            notifications: notifications.map(notificationDto),
            stats: {
                totalClasses: classes.length,
                attendedClasses: presentCount,
                pendingAssignments: 0,
                completedAssignments: 0,
                upcomingExams: exams.length
            },
            todayTimeline: classes.map((item) => ({
                id: String(item._id),
                subject: item.className ?? item.name ?? 'Class',
                timeRange: classSchedule(item),
                teacher: '',
                room: item.room ?? '',
                mode: 'onsite',
                isCurrent: false,
                countdownLabel: ''
            })),
            alerts: pendingFeeAmount > 0 ? [{ id: 'fees', title: 'Pending fees', message: `${pendingFeeAmount} AFN pending`, severity: 'warning' }] : [],
            announcements: notifications.map(notificationDto),
            recentPayments: payments
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/classes', async (req, res, next) => {
    try {
        const student = await currentStudent(req);
        const classId = objectId(student?.classId);
        const classes = classId
            ? await Class_1.ClassModel.find({ _id: classId, isDeleted: false }).select('className name title room weeklySchedule studentCount description shortDescription genderRestriction').limit(maxItems).lean()
            : [];
        ok(res, classes.map(classDto));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/schedule', async (req, res, next) => {
    try {
        const student = await currentStudent(req);
        const classId = objectId(student?.classId);
        const classes = classId ? await Class_1.ClassModel.find({ _id: classId, isDeleted: false }).select('className name title room weeklySchedule').lean() : [];
        ok(res, classes.flatMap((item) => (item.weeklySchedule ?? []).map((slot) => ({
            id: `${item._id}-${slot.dayOfWeek}-${slot.startTime}`,
            title: item.className ?? item.name ?? 'Class',
            subject: item.className ?? item.name ?? 'Class',
            teacher: '',
            room: item.room ?? '',
            dayLabel: String(slot.dayOfWeek ?? ''),
            timeLabel: `${slot.startTime ?? ''}-${slot.endTime ?? ''}`,
            mode: 'onsite'
        }))));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/attendance', async (req, res, next) => {
    try {
        const student = await currentStudent(req);
        const studentId = objectId(student?._id);
        const records = studentId
            ? await Attendance_1.Attendance.find({ studentId, isDeleted: false }).select('attendanceDate status source session subjectId teacherId markedAutomatically createdAt').sort({ attendanceDate: -1 }).limit(maxItems).lean()
            : [];
        ok(res, records.map((item) => ({
            ...item,
            id: String(item._id),
            dateLabel: compactDate(item.attendanceDate),
            mode: item.source ?? item.session ?? 'manual'
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/exams', async (req, res, next) => {
    try {
        const student = await currentStudent(req);
        const classId = objectId(student?.classId);
        const exams = classId
            ? await Exam_1.Exam.find({ class: classId, isDeleted: false }).select('title date totalMarks status onlineExamUrl googleFormUrl examType subject').sort({ date: 1 }).limit(maxItems).lean()
            : [];
        ok(res, exams.map((item) => ({
            ...item,
            id: String(item._id),
            scheduleLabel: compactDate(item.date),
            examDate: compactDate(item.date),
            mode: item.googleFormUrl || item.onlineExamUrl ? 'online' : 'onsite',
            canStart: Boolean(item.googleFormUrl || item.onlineExamUrl)
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/exams/:id', async (req, res, next) => {
    try {
        const exam = await Exam_1.Exam.findById(req.params.id).lean();
        ok(res, {
            id: String(exam?._id ?? req.params.id),
            title: exam?.title ?? 'Exam',
            questions: [],
            remainingTime: '',
            examUrl: exam?.onlineExamUrl || exam?.googleFormUrl || ''
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.post('/student/exams/:id/submit', (_req, res) => ok(res, { submitted: true }));
exports.mobileRouter.get('/student/finance', async (req, res, next) => {
    try {
        const student = await currentStudent(req);
        const studentId = objectId(student?._id);
        const payments = studentId
            ? await Payment_1.Payment.find({ studentId, isDeleted: false }).select('amount status paymentDate invoiceNumber paymentFor immutableRecord').sort({ paymentDate: -1 }).limit(maxItems).lean()
            : [];
        ok(res, payments.map((item) => ({
            ...item,
            id: String(item._id),
            title: item.paymentFor ?? 'Payment',
            amountAf: item.amount,
            dueDateLabel: compactDate(item.paymentDate),
            reference: item.invoiceNumber,
            isImmutable: item.immutableRecord ?? true
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/announcements', async (_req, res, next) => {
    try {
        const notifications = await Notification_1.Notification.find({ publishStatus: 'published', isDeleted: false })
            .sort({ pinned: -1, publishDate: -1, createdAt: -1 })
            .limit(maxItems)
            .lean();
        ok(res, notifications.map(notificationDto));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/messages', async (req, res, next) => {
    try {
        const records = await Message_1.Message.find({
            $or: [{ senderId: req.user?.userId }, { recipientId: req.user?.userId }, { recipientRole: 'student' }],
            isDeleted: false
        }).sort({ createdAt: -1 }).limit(maxItems).lean();
        ok(res, records.map(messageDto));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/classes/discover', async (_req, res, next) => {
    try {
        const classes = await Class_1.ClassModel.find({
            isDeleted: false,
            active: true,
            registrationOpen: { $ne: false }
        })
            .select('className name title room weeklySchedule studentCount description shortDescription genderRestriction feeAmount imageUrl category level')
            .sort({ featured: -1, className: 1 })
            .limit(maxItems)
            .lean();
        ok(res, classes.map((item) => ({
            ...classDto(item),
            feeAmount: Number(item.feeAmount ?? 0),
            imageUrl: item.imageUrl ?? '',
            category: item.category ?? item.level ?? ''
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/chat/contacts', async (req, res, next) => {
    try {
        const context = await currentStudentContext(req);
        if (!context?.classId)
            return ok(res, { classmates: [], teachers: [], admins: [], groups: [] });
        const classmates = await Student_1.Student.find({
            _id: { $ne: context.studentId },
            classId: context.classId,
            status: 'active',
            isDeleted: false
        }).select('firstName lastName studentId profileImage classId').limit(80).lean();
        const classmateUsers = await Promise.all(classmates.map((item) => studentUserForStudentId(item._id)));
        const classDoc = await Class_1.ClassModel.findById(context.classId)
            .select('className assignedTeachers teacherId')
            .populate('assignedTeachers', 'name email profileImage role')
            .populate('teacherId', 'name email profileImage role')
            .lean();
        const teacherDocs = [
            classDoc?.teacherId,
            ...(Array.isArray(classDoc?.assignedTeachers) ? classDoc.assignedTeachers : [])
        ].filter(Boolean);
        const teachersById = new Map();
        teacherDocs.forEach((teacher) => teachersById.set(String(teacher._id), teacher));
        if (context.teacherId && !teachersById.has(String(context.teacherId))) {
            const teacher = await User_1.User.findById(context.teacherId).select('name email profileImage role').lean();
            if (teacher)
                teachersById.set(String(teacher._id), teacher);
        }
        const admins = await User_1.User.find({
            role: { $in: ['super_admin', 'admin', 'branch_manager'] },
            isDeleted: false,
            active: { $ne: false },
            $or: [{ branchId: context.branchId }, { role: { $in: ['super_admin', 'admin'] } }]
        }).select('name email role profileImage').limit(20).lean();
        ok(res, {
            classmates: classmates.map((student, index) => ({
                id: String(classmateUsers[index]?._id ?? student._id),
                studentId: String(student._id),
                name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim(),
                role: 'classmate',
                profileImage: student.profileImage ?? ''
            })).filter((item) => item.id),
            teachers: Array.from(teachersById.values()).map((teacher) => ({
                id: String(teacher._id),
                name: teacher.name ?? 'Teacher',
                role: 'teacher',
                profileImage: teacher.profileImage ?? ''
            })),
            admins: admins.map((admin) => ({
                id: String(admin._id),
                name: admin.name ?? 'Admin',
                role: 'admin',
                profileImage: admin.profileImage ?? ''
            })),
            groups: [{
                    id: String(context.classId),
                    name: classDoc?.className ?? 'Class group',
                    role: 'class_group'
                }]
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/student/chat/messages', async (req, res, next) => {
    try {
        const context = await currentStudentContext(req);
        if (!context?.userId)
            return ok(res, []);
        const targetId = String(req.query.targetId ?? '');
        const targetType = String(req.query.targetType ?? '');
        const filter = { isDeleted: false };
        if (targetType === 'class_group' && context.classId && targetId === String(context.classId)) {
            filter.classId = context.classId;
            filter.messageType = { $in: ['student_to_class_group', 'student_resource_share'] };
        }
        else {
            const targetObjectId = objectId(targetId);
            if (!targetObjectId)
                return ok(res, []);
            filter.$or = [
                { senderId: context.userId, recipientId: targetObjectId },
                { senderId: targetObjectId, recipientId: context.userId }
            ];
        }
        const records = await Message_1.Message.find(filter)
            .sort({ createdAt: 1 })
            .limit(200)
            .populate('senderId', 'name role profileImage')
            .populate('recipientId', 'name role profileImage')
            .lean();
        ok(res, records.map((item) => ({
            ...chatMessageDto(item),
            isMine: String(item.senderId?._id ?? item.senderId) === String(context.userId)
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.post('/student/chat/messages', async (req, res, next) => {
    try {
        const context = await currentStudentContext(req);
        if (!context?.userId || !context.studentId) {
            return res.status(403).json({ success: false, message: 'Student profile not found' });
        }
        const targetType = String(req.body?.targetType ?? '');
        const targetId = String(req.body?.targetId ?? '');
        const body = String(req.body?.message ?? '').trim();
        if (!body)
            return res.status(400).json({ success: false, message: 'Message is required' });
        let recipientId = null;
        let recipientRole = '';
        let targetGroup = '';
        let messageType = 'student_to_teacher';
        if (targetType === 'classmate') {
            const classmateUserId = objectId(targetId);
            const classmateUser = classmateUserId
                ? await User_1.User.findOne({ _id: classmateUserId, role: 'student', isDeleted: false }).select('studentId').lean()
                : null;
            const classmate = classmateUser?.studentId
                ? await Student_1.Student.findOne({ studentId: classmateUser.studentId, classId: context.classId, isDeleted: false }).select('_id').lean()
                : null;
            if (!classmate)
                return res.status(403).json({ success: false, message: 'Classmate access denied' });
            recipientId = classmateUserId;
            recipientRole = 'student';
            messageType = 'student_to_student';
        }
        else if (targetType === 'teacher') {
            const teacherId = objectId(targetId);
            const allowed = teacherId && (String(teacherId) === String(context.teacherId) || await Class_1.ClassModel.exists({ _id: context.classId, assignedTeachers: teacherId }));
            if (!allowed)
                return res.status(403).json({ success: false, message: 'Teacher access denied' });
            recipientId = teacherId;
            recipientRole = 'teacher';
            messageType = 'student_to_teacher';
        }
        else if (targetType === 'admin') {
            const adminId = objectId(targetId);
            const admin = adminId ? await User_1.User.findOne({ _id: adminId, role: { $in: ['super_admin', 'admin', 'branch_manager'] }, isDeleted: false }).lean() : null;
            if (!admin)
                return res.status(403).json({ success: false, message: 'Admin access denied' });
            recipientId = adminId;
            recipientRole = 'admin';
            targetGroup = 'admin';
            messageType = 'student_to_admin';
        }
        else if (targetType === 'class_group' && targetId === String(context.classId)) {
            targetGroup = 'class_group';
            recipientRole = 'student';
            messageType = 'student_to_class_group';
        }
        else {
            return res.status(400).json({ success: false, message: 'Invalid chat target' });
        }
        const item = await Message_1.Message.create({
            senderId: context.userId,
            senderRole: 'student',
            recipientId,
            recipientRole,
            targetGroup,
            studentId: context.studentId,
            teacherId: targetType === 'teacher' ? recipientId : context.teacherId,
            branchId: context.branchId,
            classId: context.classId,
            subject: String(req.body?.subject ?? 'Student chat').slice(0, 200),
            body,
            category: 'student',
            messageType,
            attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5) : [],
            status: 'unread',
            priority: 'normal'
        });
        return ok(res, { ...chatMessageDto(item.toObject()), isMine: true });
    }
    catch (error) {
        return next(error);
    }
});
exports.mobileRouter.post('/student/resources/share', async (req, res, next) => {
    try {
        const context = await currentStudentContext(req);
        if (!context?.userId || !context.studentId)
            return res.status(403).json({ success: false, message: 'Student profile not found' });
        const targetType = String(req.body?.targetType ?? '');
        const targetId = String(req.body?.targetId ?? '');
        const title = String(req.body?.title ?? 'Shared resource').trim().slice(0, 200);
        const description = String(req.body?.description ?? '').trim().slice(0, 2000);
        const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5).map(String) : [];
        if (!description && !attachments.length)
            return res.status(400).json({ success: false, message: 'Resource content is required' });
        const created = await Message_1.Message.create({
            senderId: context.userId,
            senderRole: 'student',
            recipientId: targetType === 'teacher' ? objectId(targetId) : null,
            recipientRole: targetType === 'teacher' ? 'teacher' : 'student',
            targetGroup: targetType === 'class_group' ? 'class_group' : '',
            studentId: context.studentId,
            teacherId: targetType === 'teacher' ? objectId(targetId) : context.teacherId,
            branchId: context.branchId,
            classId: context.classId,
            subject: title,
            body: description || title,
            category: 'academic',
            messageType: 'student_resource_share',
            attachments,
            status: 'unread'
        });
        ok(res, chatMessageDto(created.toObject()));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.post('/student/ai-assistant', async (req, res, next) => {
    try {
        const context = await currentStudentContext(req);
        if (!context)
            return res.status(403).json({ success: false, message: 'Student profile not found' });
        const prompt = String(req.body?.prompt ?? '').trim();
        const lang = String(req.body?.lang ?? 'en');
        if (!prompt)
            return res.status(400).json({ success: false, message: 'Prompt is required' });
        const [klass, subject] = await Promise.all([
            context.classId ? Class_1.ClassModel.findById(context.classId).select('className classCode').lean() : null,
            objectId(context.student.subjectId) ? Subject_1.Subject.findById(context.student.subjectId).select('title code').lean() : null
        ]);
        ok(res, {
            title: 'Student AI Assistant',
            answer: [
                `Class: ${klass?.className ?? 'Your class'}`,
                `Subject: ${subject?.title ?? 'Your subject'}`,
                `Focus: ${prompt}`,
                'Recommended study plan: review today notes, solve 3 practice questions, ask your teacher one specific question, and summarize what you learned.',
                lang === 'fa' ? 'پیشنهاد: پاسخ را کوتاه یادداشت کنید و با معلم شریک سازید.' : '',
                lang === 'ps' ? 'سپارښتنه: لنډ یادښت جوړ کړئ او له ښوونکي سره یې شریک کړئ.' : ''
            ].filter(Boolean).join('\n')
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.post('/student/teacher-ratings', async (req, res, next) => {
    try {
        const context = await currentStudentContext(req);
        if (!context?.userId || !context.studentId || !context.classId)
            return res.status(403).json({ success: false, message: 'Student profile not found' });
        const teacherId = objectId(req.body?.teacherId) ?? context.teacherId;
        const rating = Number(req.body?.rating ?? 0);
        const comment = String(req.body?.comment ?? '').trim().slice(0, 1200);
        const allowed = teacherId && (String(teacherId) === String(context.teacherId) || await Class_1.ClassModel.exists({ _id: context.classId, assignedTeachers: teacherId }));
        if (!allowed)
            return res.status(403).json({ success: false, message: 'Teacher access denied' });
        if (rating < 1 || rating > 5)
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        const item = await TeacherRating_1.TeacherRating.findOneAndUpdate({
            studentId: context.studentId,
            teacherId,
            classId: context.classId,
            isDeleted: false
        }, {
            studentId: context.studentId,
            studentUserId: context.userId,
            teacherId,
            classId: context.classId,
            branchId: context.branchId,
            rating,
            comment,
            status: 'pending_admin_review'
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        ok(res, { id: String(item._id), status: item.status, rating: item.rating });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/dashboard', async (req, res, next) => {
    try {
        const { parent, family, studentIds } = await currentParentScope(req);
        const [students, payments] = await Promise.all([
            studentIds.length ? Student_1.Student.find({ _id: { $in: studentIds }, isDeleted: false }).lean() : Promise.resolve([]),
            studentIds.length ? Payment_1.Payment.find({ studentId: { $in: studentIds }, status: { $in: ['pending'] }, isDeleted: false }).lean() : Promise.resolve([])
        ]);
        const studentUserIds = await studentUserIdsForStudentRecords(studentIds);
        const [attendanceCount, presentCount, results] = await Promise.all([
            studentIds.length ? Attendance_1.Attendance.countDocuments({ studentId: { $in: studentIds }, isDeleted: false }) : Promise.resolve(0),
            studentIds.length ? Attendance_1.Attendance.countDocuments({ studentId: { $in: studentIds }, status: 'present', isDeleted: false }) : Promise.resolve(0),
            studentUserIds.length ? Result_1.Result.find({ student: { $in: studentUserIds }, isDeleted: false }).select('score').lean() : Promise.resolve([])
        ]);
        const averageScore = results.length
            ? Math.round(results.reduce((sum, item) => sum + Number(item.score || 0), 0) / results.length)
            : 0;
        ok(res, {
            familyName: parent?.guardianName ?? family?.guardianName ?? 'Family',
            studentsCount: students.length,
            linkedStudentsCount: students.length,
            pendingInvoices: payments.length,
            averageAttendance: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : 0,
            averageScore,
            alerts: payments.length ? [{ title: 'Pending invoices', message: `${payments.length} payment(s) pending`, type: 'finance' }] : []
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/linked-students', async (req, res, next) => {
    try {
        const { studentIds } = await currentParentScope(req);
        const students = studentIds.length
            ? await Student_1.Student.find({ _id: { $in: studentIds }, isDeleted: false }).populate('classId').lean()
            : [];
        ok(res, students.map((item) => ({
            id: String(item._id),
            _id: String(item._id),
            fullName: `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
            className: item.classId?.className ?? '',
            status: item.status ?? 'active',
            attendancePercentage: 0,
            averageScore: 0
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/classes', async (req, res, next) => {
    try {
        const { studentIds } = await currentParentScope(req);
        const students = studentIds.length
            ? await Student_1.Student.find({ _id: { $in: studentIds }, isDeleted: false }).select('classId').lean()
            : [];
        const classIds = Array.from(new Set(students.map((student) => String(student.classId ?? '')).filter(Boolean)))
            .map(objectId)
            .filter((id) => Boolean(id));
        const classes = classIds.length
            ? await Class_1.ClassModel.find({ _id: { $in: classIds }, isDeleted: false })
                .select('className name title room weeklySchedule studentCount description shortDescription genderRestriction')
                .lean()
            : [];
        ok(res, classes.map(classDto));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/schedule', async (req, res, next) => {
    try {
        const { studentIds } = await currentParentScope(req);
        const students = studentIds.length
            ? await Student_1.Student.find({ _id: { $in: studentIds }, isDeleted: false }).select('classId').lean()
            : [];
        const classIds = Array.from(new Set(students.map((student) => String(student.classId ?? '')).filter(Boolean)))
            .map(objectId)
            .filter((id) => Boolean(id));
        const classes = classIds.length
            ? await Class_1.ClassModel.find({ _id: { $in: classIds }, isDeleted: false }).select('className name title room weeklySchedule').lean()
            : [];
        ok(res, classes.flatMap((item) => (item.weeklySchedule ?? []).map((slot) => ({
            id: `${item._id}-${slot.dayOfWeek}-${slot.startTime}`,
            title: item.className ?? item.name ?? 'Class',
            subject: item.className ?? item.name ?? 'Class',
            room: item.room ?? '',
            dayLabel: String(slot.dayOfWeek ?? ''),
            timeLabel: `${slot.startTime ?? ''}-${slot.endTime ?? ''}`,
            mode: 'onsite'
        }))));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/attendance', async (req, res, next) => {
    try {
        const { studentIds } = await currentParentScope(req);
        const records = studentIds.length
            ? await Attendance_1.Attendance.find({ studentId: { $in: studentIds }, isDeleted: false }).sort({ attendanceDate: -1 }).limit(maxItems).lean()
            : [];
        ok(res, records.map((item) => ({ ...item, id: String(item._id), dateLabel: compactDate(item.attendanceDate) })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/progress', async (req, res, next) => {
    try {
        const { studentIds } = await currentParentScope(req);
        const studentUserIds = await studentUserIdsForStudentRecords(studentIds);
        const results = studentUserIds.length
            ? await Result_1.Result.find({ student: { $in: studentUserIds }, isDeleted: false })
                .populate('student', 'name studentId')
                .populate('exam', 'title date totalMarks')
                .populate('subjectId', 'title name')
                .sort({ createdAt: -1 })
                .limit(maxItems)
                .lean()
            : [];
        ok(res, results.map((item) => ({
            ...item,
            id: String(item._id),
            averageScore: item.score,
            title: item.exam?.title ?? item.subjectId?.title ?? 'Result',
            studentName: item.student?.name ?? '',
            subjectName: item.subjectId?.title ?? item.subjectId?.name ?? '',
            status: Number(item.score ?? 0) >= 50 ? 'passed' : 'failed'
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/exams', async (req, res, next) => {
    try {
        const { studentIds } = await currentParentScope(req);
        const studentUserIds = await studentUserIdsForStudentRecords(studentIds);
        const results = studentUserIds.length
            ? await Result_1.Result.find({ student: { $in: studentUserIds }, isDeleted: false })
                .populate('student', 'name studentId')
                .populate('exam', 'title date totalMarks')
                .populate('subjectId', 'title name')
                .sort({ createdAt: -1 })
                .limit(maxItems)
                .lean()
            : [];
        ok(res, results.map((item) => ({
            ...item,
            id: String(item._id),
            averageScore: item.score,
            title: item.exam?.title ?? item.subjectId?.title ?? 'Exam result',
            studentName: item.student?.name ?? '',
            subjectName: item.subjectId?.title ?? item.subjectId?.name ?? '',
            examDate: compactDate(item.exam?.date)
        })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/finance', async (req, res, next) => {
    try {
        const { studentIds } = await currentParentScope(req);
        const payments = studentIds.length
            ? await Payment_1.Payment.find({ studentId: { $in: studentIds }, isDeleted: false }).sort({ paymentDate: -1 }).limit(maxItems).lean()
            : [];
        ok(res, payments.map((item) => ({ ...item, id: String(item._id), amountAf: item.amount, dueDateLabel: compactDate(item.paymentDate), reference: item.invoiceNumber })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/parent/messages', async (req, res, next) => {
    try {
        const records = await Message_1.Message.find({
            $or: [{ senderId: req.user?.userId }, { recipientId: req.user?.userId }, { recipientRole: 'parent' }],
            isDeleted: false
        }).sort({ createdAt: -1 }).limit(maxItems).lean();
        ok(res, records.map(messageDto));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/dashboard', async (req, res, next) => {
    try {
        const user = await currentUser(req);
        const teacher = await currentTeacher(req);
        const classes = await Class_1.ClassModel.find({ $or: [{ teacherId: req.user?.userId }, { assignedTeachers: req.user?.userId }], isDeleted: false })
            .limit(maxItems)
            .lean();
        const salary = await Salary_1.Salary.findOne({ employeeId: req.user?.userId, isDeleted: false }).sort({ monthKey: -1 }).lean();
        ok(res, {
            teacherName: user?.name ?? 'Teacher',
            todayClasses: classes.length,
            pendingAttendance: 0,
            pendingGrades: 0,
            monthlySalaryAf: Number(salary?.netAmount ?? teacher?.fixedSalary ?? user?.fixedSalary ?? 0),
            highlights: classes.slice(0, 3).map((item) => ({ title: item.className ?? 'Class', message: classSchedule(item), type: 'class' }))
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/classes', async (req, res, next) => {
    try {
        const classes = await Class_1.ClassModel.find({ $or: [{ teacherId: req.user?.userId }, { assignedTeachers: req.user?.userId }], isDeleted: false })
            .limit(maxItems)
            .lean();
        ok(res, classes.map(classDto));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/classes/:classId/participants', async (req, res, next) => {
    try {
        const classDoc = await teacherClassForRequest(req, req.params.classId);
        if (!classDoc) {
            return res.status(403).json({ success: false, message: 'Teacher is not assigned to this class' });
        }
        const students = await Student_1.Student.find({
            classId: classDoc._id,
            status: 'active',
            isDeleted: false
        }).select('firstName lastName studentId profileImage parentProfileId').limit(120).lean();
        const studentObjectIds = students.map((item) => objectId(item._id)).filter(Boolean);
        const parentIds = students
            .map((item) => objectId(item.parentProfileId))
            .filter((id) => Boolean(id));
        const parents = parentIds.length || studentObjectIds.length
            ? await Parent_1.ParentProfile.find({
                isDeleted: false,
                $or: [
                    parentIds.length ? { _id: { $in: parentIds } } : { _id: null },
                    studentObjectIds.length ? { linkedStudentIds: { $in: studentObjectIds } } : { _id: null }
                ]
            }).select('guardianName guardianPhone guardianEmail linkedStudentIds').lean()
            : [];
        const parentsById = new Map(parents.map((parent) => [String(parent._id), parent]));
        const parentsByStudentId = new Map();
        parents.forEach((parent) => {
            (parent.linkedStudentIds ?? []).forEach((studentId) => {
                parentsByStudentId.set(String(studentId), parent);
            });
        });
        ok(res, {
            class: classDto(classDoc),
            students: students.map((student) => ({
                id: String(student._id),
                name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || 'Student',
                role: 'student',
                studentId: student.studentId ?? '',
                profileImage: student.profileImage ?? '',
                parentId: String(student.parentProfileId ?? '')
            })),
            parents: students
                .map((student) => parentDto(parentsById.get(String(student.parentProfileId)) ?? parentsByStudentId.get(String(student._id)) ?? null, student))
                .filter((parent, index, list) => parent.id && list.findIndex((item) => item.id === parent.id) === index)
        });
    }
    catch (error) {
        return next(error);
    }
});
exports.mobileRouter.get('/teacher/classes/:classId/messages', async (req, res, next) => {
    try {
        const classDoc = await teacherClassForRequest(req, req.params.classId);
        if (!classDoc) {
            return res.status(403).json({ success: false, message: 'Teacher is not assigned to this class' });
        }
        const records = await Message_1.Message.find({
            classId: classDoc._id,
            isDeleted: false,
            messageType: { $in: ['student_to_class_group', 'student_resource_share', 'teacher_to_class_group', 'teacher_resource_share'] }
        })
            .sort({ createdAt: 1 })
            .limit(250)
            .populate('senderId', 'name role profileImage')
            .lean();
        ok(res, records.map((item) => ({
            ...chatMessageDto(item),
            isMine: String(item.senderId?._id ?? item.senderId) === String(req.user?.userId)
        })));
    }
    catch (error) {
        return next(error);
    }
});
exports.mobileRouter.post('/teacher/classes/:classId/messages', async (req, res, next) => {
    try {
        const classDoc = await teacherClassForRequest(req, req.params.classId);
        if (!classDoc) {
            return res.status(403).json({ success: false, message: 'Teacher is not assigned to this class' });
        }
        const user = await currentUser(req);
        const body = String(req.body?.message ?? req.body?.body ?? '').trim();
        if (!body) {
            return res.status(400).json({ success: false, message: 'Message body is required' });
        }
        const item = await Message_1.Message.create({
            senderId: req.user?.userId,
            senderRole: 'teacher',
            senderName: user?.name ?? 'Teacher',
            senderEmail: user?.email ?? '',
            senderPhone: user?.phone ?? '',
            recipientId: null,
            recipientRole: 'student',
            targetGroup: 'class_group',
            teacherId: req.user?.userId,
            classId: classDoc._id,
            branchId: classDoc.branchId ?? req.user?.branchId ?? null,
            subject: String(req.body?.subject ?? classDoc.className ?? 'Class chat').slice(0, 200),
            body,
            category: 'teacher',
            messageType: 'teacher_to_class_group',
            attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5).map(String) : [],
            status: 'unread',
            priority: 'normal'
        });
        return ok(res, { ...chatMessageDto(item.toObject()), isMine: true });
    }
    catch (error) {
        return next(error);
    }
});
exports.mobileRouter.post('/teacher/resources/share', async (req, res, next) => {
    try {
        const rawClassIds = Array.isArray(req.body?.classIds)
            ? req.body.classIds
            : [req.body?.classId];
        const requestedClassIds = rawClassIds
            .map(objectId)
            .filter((id) => Boolean(id));
        const uniqueClassIds = Array.from(new Set(requestedClassIds.map(String)))
            .map((id) => new mongoose_1.default.Types.ObjectId(id));
        if (!uniqueClassIds.length) {
            return res.status(400).json({ success: false, message: 'Select at least one class' });
        }
        const allowedClasses = await Class_1.ClassModel.find({
            _id: { $in: uniqueClassIds },
            isDeleted: false,
            $or: [{ teacherId: req.user?.userId }, { assignedTeachers: req.user?.userId }]
        }).select('className branchId').lean();
        if (allowedClasses.length !== uniqueClassIds.length) {
            return res.status(403).json({ success: false, message: 'Teacher-class relationship validation failed' });
        }
        const title = String(req.body?.title ?? 'Shared resource').trim().slice(0, 200);
        const description = String(req.body?.description ?? '').trim().slice(0, 5000);
        const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5).map(String) : [];
        if (!description && !attachments.length) {
            return res.status(400).json({ success: false, message: 'Resource content is required' });
        }
        const docs = allowedClasses.map((classDoc) => ({
            senderId: req.user?.userId,
            senderRole: 'teacher',
            recipientId: null,
            recipientRole: 'student',
            targetGroup: 'class_group',
            teacherId: req.user?.userId,
            classId: classDoc._id,
            branchId: classDoc.branchId ?? req.user?.branchId ?? null,
            subject: title,
            body: description || title,
            category: 'academic',
            messageType: 'teacher_resource_share',
            attachments,
            status: 'unread',
            priority: 'normal'
        }));
        const created = await Message_1.Message.insertMany(docs);
        return ok(res, {
            sharedCount: created.length,
            classIds: allowedClasses.map((item) => String(item._id))
        });
    }
    catch (error) {
        return next(error);
    }
});
exports.mobileRouter.get('/teacher/schedule', async (req, res, next) => {
    try {
        const classes = await Class_1.ClassModel.find({ $or: [{ teacherId: req.user?.userId }, { assignedTeachers: req.user?.userId }], isDeleted: false }).lean();
        ok(res, classes.flatMap((item) => (item.weeklySchedule ?? []).map((slot) => ({
            id: `${item._id}-${slot.dayOfWeek}-${slot.startTime}`,
            className: item.className ?? item.name ?? 'Class',
            subject: item.className ?? item.name ?? 'Class',
            room: item.room ?? '',
            dayLabel: String(slot.dayOfWeek ?? ''),
            timeLabel: `${slot.startTime ?? ''}-${slot.endTime ?? ''}`
        }))));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/attendance', async (req, res, next) => {
    try {
        const records = await Attendance_1.Attendance.find({ teacherId: req.user?.userId, isDeleted: false }).sort({ attendanceDate: -1 }).limit(maxItems).lean();
        ok(res, records.map((item) => ({ ...item, id: String(item._id), dateLabel: compactDate(item.attendanceDate) })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/salary', async (req, res, next) => {
    try {
        const [user, salary] = await Promise.all([
            currentUser(req),
            Salary_1.Salary.findOne({ employeeId: req.user?.userId, isDeleted: false }).sort({ monthKey: -1 }).lean()
        ]);
        const baseSalary = Number(salary?.baseAmount ?? user?.fixedSalary ?? 0);
        const totalDeduction = Number(salary?.deductions ?? 0);
        ok(res, {
            baseSalaryAf: baseSalary,
            absenceCount: 0,
            deductionPerAbsenceAf: 50,
            totalDeductionAf: totalDeduction,
            netSalaryAf: Number(salary?.netAmount ?? Math.max(0, baseSalary - totalDeduction))
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/exams', async (req, res, next) => {
    try {
        const exams = await Exam_1.Exam.find({ teacherId: req.user?.userId, isDeleted: false }).sort({ date: 1 }).limit(maxItems).lean();
        ok(res, exams.map((item) => ({ ...item, id: String(item._id), scheduleLabel: compactDate(item.date), examDate: compactDate(item.date) })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/grading', async (req, res, next) => {
    try {
        const exams = await Exam_1.Exam.find({ teacherId: req.user?.userId, isDeleted: false }).sort({ date: -1 }).limit(maxItems).lean();
        ok(res, exams.map((item) => ({ ...item, id: String(item._id), pendingCount: 0, gradedCount: 0 })));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/messages', async (req, res, next) => {
    try {
        const records = await Message_1.Message.find({
            $or: [{ senderId: req.user?.userId }, { recipientId: req.user?.userId }, { recipientRole: 'teacher' }],
            ...branchFilter(req),
            isDeleted: false
        }).sort({ createdAt: -1 }).limit(maxItems).lean();
        ok(res, records.map(messageDto));
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/teacher/ratings-summary', async (req, res, next) => {
    try {
        const teacherId = objectId(req.user?.userId);
        if (!teacherId)
            return ok(res, { averageRating: 0, totalRatings: 0, recent: [] });
        const filter = {
            teacherId,
            status: 'reviewed',
            isDeleted: false
        };
        const [summary, recent] = await Promise.all([
            TeacherRating_1.TeacherRating.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: '$teacherId',
                        averageRating: { $avg: '$rating' },
                        totalRatings: { $sum: 1 }
                    }
                }
            ]),
            TeacherRating_1.TeacherRating.find(filter)
                .populate('studentId', 'firstName lastName studentId')
                .populate('classId', 'className name')
                .sort({ updatedAt: -1, createdAt: -1 })
                .limit(5)
                .lean()
        ]);
        const stats = summary[0] ?? {};
        ok(res, {
            averageRating: Number(Number(stats.averageRating ?? 0).toFixed(1)),
            totalRatings: Number(stats.totalRatings ?? 0),
            recent: recent.map((item) => ({
                id: String(item._id),
                rating: Number(item.rating ?? 0),
                comment: item.comment ?? '',
                studentName: item.studentId
                    ? `${item.studentId.firstName ?? ''} ${item.studentId.lastName ?? ''}`.trim()
                    : 'Student',
                className: item.classId?.className ?? item.classId?.name ?? '',
                createdAt: compactDate(item.createdAt)
            }))
        });
    }
    catch (error) {
        next(error);
    }
});
exports.mobileRouter.get('/:role/messages/:id', async (req, res, next) => {
    try {
        const item = await Message_1.Message.findOne({
            _id: req.params.id,
            $or: [
                { senderId: req.user?.userId },
                { recipientId: req.user?.userId },
                { recipientRole: req.params.role }
            ],
            isDeleted: false
        }).lean();
        if (!item) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        return ok(res, messageDto(item));
    }
    catch (error) {
        return next(error);
    }
});
exports.mobileRouter.post('/:role/messages/:id', async (req, res, next) => {
    try {
        const user = await currentUser(req);
        const body = String(req.body?.message ?? req.body?.body ?? '').trim();
        if (!body) {
            return res.status(400).json({ success: false, message: 'Message body is required' });
        }
        const parentMessageId = objectId(req.params.id);
        const created = await Message_1.Message.create({
            senderId: req.user?.userId,
            senderRole: req.user?.canonicalRole ?? req.user?.role ?? req.params.role,
            senderName: user?.name ?? '',
            senderEmail: user?.email ?? '',
            senderPhone: user?.phone ?? '',
            recipientRole: '',
            subject: 'Mobile reply',
            body,
            category: 'support',
            messageType: 'customer_to_admin',
            status: 'unread',
            parentMessageId,
            threadId: parentMessageId,
            branchId: req.user?.branchId ?? null
        });
        return ok(res, messageDto(created.toObject()));
    }
    catch (error) {
        return next(error);
    }
});
