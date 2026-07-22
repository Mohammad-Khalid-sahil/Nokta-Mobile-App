"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRouter = void 0;
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../../middlewares/auth");
const response_1 = require("../../helpers/response");
const AuditLog_1 = require("../../models/AuditLog");
const Book_1 = require("../../models/Book");
const Branch_1 = require("../../models/Branch");
const Class_1 = require("../../models/Class");
const Attendance_1 = require("../../models/Attendance");
const Expense_1 = require("../../models/Expense");
const Family_1 = require("../../models/Family");
const FinanceEntry_1 = require("../../models/FinanceEntry");
const Notification_1 = require("../../models/Notification");
const Payment_1 = require("../../models/Payment");
const Report_1 = require("../../models/Report");
const Result_1 = require("../../models/Result");
const Role_1 = require("../../models/Role");
const Subject_1 = require("../../models/Subject");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const Exam_1 = require("../../models/Exam");
const Message_1 = require("../../models/Message");
const Curriculum_1 = require("../../models/Curriculum");
const Course_1 = require("../../models/Course");
const dashboardPeriod_1 = require("./dashboardPeriod");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'accountant', 'librarian', 'student', 'family_student', 'parent', 'owner']));
function enrollmentGroupId(period) {
    if (period === 'day') {
        return {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
            hour: { $hour: '$createdAt' }
        };
    }
    if (period === 'month') {
        return {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
        };
    }
    return {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' }
    };
}
function financeGroupId(period, dateField) {
    const field = `$${dateField}`;
    if (period === 'day') {
        return {
            year: { $year: field },
            month: { $month: field },
            day: { $dayOfMonth: field },
            hour: { $hour: field }
        };
    }
    if (period === 'month') {
        return {
            year: { $year: field },
            month: { $month: field },
            day: { $dayOfMonth: field }
        };
    }
    return {
        year: { $year: field },
        month: { $month: field }
    };
}
function findTrendTotal(period, bucket, entries) {
    return (entries.find((entry) => (0, dashboardPeriod_1.matchTrendBucket)(period, bucket, {
        year: entry._id.year,
        month: entry._id.month,
        day: entry._id.day,
        hour: entry._id.hour
    }))?.total ?? 0);
}
function emptyTrendPayload(period, startDate, endDate) {
    return {
        period,
        rangeStart: startDate.toISOString(),
        rangeEnd: endDate.toISOString(),
        enrollmentTrend: [],
        monthlyFinances: [],
        expenseCategoryBreakdown: []
    };
}
async function buildLiteDashboardPayload(input) {
    const base = emptyTrendPayload(input.period, input.startDate, input.endDate);
    const zeroCounts = {
        totalBranches: 0,
        totalBooks: 0,
        totalUsers: 0,
        totalFamilies: 0,
        totalAuditLogs: 0,
        totalAttendance: 0,
        totalExams: 0,
        totalResults: 0,
        totalPayments: 0,
        totalFinanceEntries: 0,
        totalReports: 0,
        totalMessages: 0,
        totalStudentFees: 0
    };
    if (input.isTeacher) {
        const [totalStudents, totalClasses, totalSubjects] = await Promise.all([
            Student_1.Student.countDocuments(input.studentPeriodFilter),
            Class_1.ClassModel.countDocuments(input.classPeriodFilter),
            Subject_1.Subject.countDocuments(input.subjectPeriodFilter)
        ]);
        return {
            ...base,
            ...zeroCounts,
            totalStudents,
            totalTeachers: 1,
            totalClasses,
            totalSubjects,
            totalNotifications: 0,
            incomeTotal: 0,
            expenseTotal: 0,
            outstandingBalance: 0
        };
    }
    if (input.isFamily) {
        const [totalStudents, totalClasses, studentBalance, totalNotifications] = await Promise.all([
            Student_1.Student.countDocuments(input.studentPeriodFilter),
            Class_1.ClassModel.countDocuments(input.classPeriodFilter),
            Student_1.Student.aggregate([
                { $match: input.studentPeriodFilter },
                { $group: { _id: null, total: { $sum: '$remainingBalance' }, totalFees: { $sum: '$feeAmount' } } }
            ]),
            Notification_1.Notification.countDocuments(input.notificationFilter)
        ]);
        return {
            ...base,
            ...zeroCounts,
            totalStudents,
            totalTeachers: 0,
            totalClasses,
            totalSubjects: 0,
            totalNotifications,
            incomeTotal: 0,
            expenseTotal: 0,
            outstandingBalance: Math.round(studentBalance[0]?.total ?? 0),
            totalStudentFees: Math.round(studentBalance[0]?.totalFees ?? 0)
        };
    }
    if (input.role === 'librarian') {
        const totalBooks = await Book_1.Book.countDocuments(input.bookFilter);
        return {
            ...base,
            ...zeroCounts,
            totalStudents: 0,
            totalTeachers: 0,
            totalClasses: 0,
            totalSubjects: 0,
            totalNotifications: 0,
            totalBooks,
            incomeTotal: 0,
            expenseTotal: 0,
            outstandingBalance: 0
        };
    }
    const financeQueries = input.canViewFinance
        ? await Promise.all([
            Payment_1.Payment.aggregate([{ $match: input.paymentFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            FinanceEntry_1.FinanceEntry.aggregate([{ $match: input.financeEntryFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Expense_1.Expense.aggregate([{ $match: input.expenseFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Payment_1.Payment.countDocuments(input.paymentFilter)
        ])
        : [[], [], [], 0];
    const [paymentTotals, manualIncomeTotals, expenseTotals, totalPayments] = financeQueries;
    const [totalStudents, totalTeachers, totalClasses, studentBalance, totalBooks] = await Promise.all([
        Student_1.Student.countDocuments(input.studentPeriodFilter),
        User_1.User.countDocuments(input.teacherPeriodFilter),
        Class_1.ClassModel.countDocuments(input.classPeriodFilter),
        Student_1.Student.aggregate([
            { $match: input.studentPeriodFilter },
            { $group: { _id: null, total: { $sum: '$remainingBalance' }, totalFees: { $sum: '$feeAmount' } } }
        ]),
        input.role === 'owner' ? Book_1.Book.countDocuments({ isDeleted: false }) : Promise.resolve(0)
    ]);
    return {
        ...base,
        ...zeroCounts,
        totalStudents,
        totalTeachers,
        totalClasses,
        totalSubjects: 0,
        totalNotifications: 0,
        totalBooks,
        totalUsers: typeof totalPayments === 'number' ? totalPayments : 0,
        incomeTotal: Math.round((paymentTotals[0]?.total ?? 0) + (manualIncomeTotals[0]?.total ?? 0)),
        expenseTotal: Math.round(expenseTotals[0]?.total ?? 0),
        outstandingBalance: Math.round(studentBalance[0]?.total ?? 0),
        totalStudentFees: Math.round(studentBalance[0]?.totalFees ?? 0),
        totalPayments: typeof totalPayments === 'number' ? totalPayments : 0
    };
}
async function buildDashboardSummary(req, res, next) {
    try {
        const period = (0, dashboardPeriod_1.parseDashboardPeriod)(req.query?.period);
        const isLite = req.query?.lite === '1' || req.query?.lite === 'true';
        const now = new Date();
        const { start: startDate, end: endDate } = (0, dashboardPeriod_1.getDashboardDateRange)(period, now);
        const rangeFilter = (0, dashboardPeriod_1.dateRangeFilter)(startDate, endDate);
        const buckets = (0, dashboardPeriod_1.buildTrendBuckets)(period, { start: startDate, end: endDate });
        const role = req.user?.canonicalRole ?? req.user?.role;
        const userId = req.user?.userId;
        const branchId = req.user?.branchId;
        const isTeacher = role === 'teacher';
        const isStudent = role === 'student';
        const isFamily = role === 'parent' || role === 'family_student' || role === 'family';
        const isBranchScoped = role === 'branch_manager' && branchId;
        const canViewFinance = ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(String(role));
        const branchObjectId = branchId && mongoose_1.default.Types.ObjectId.isValid(branchId)
            ? new mongoose_1.default.Types.ObjectId(branchId)
            : null;
        const branchFilter = isBranchScoped && branchObjectId ? { branchId: branchObjectId } : {};
        const studentFilter = { isDeleted: false, ...branchFilter };
        const teacherFilter = { role: 'teacher', isDeleted: false, ...branchFilter };
        const classFilter = { isDeleted: false, ...branchFilter };
        const subjectFilter = { isDeleted: false, ...branchFilter };
        const notificationFilter = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
        const paymentFilter = { isDeleted: false, ...branchFilter, paymentDate: rangeFilter };
        const financeEntryFilter = { isDeleted: false, ...branchFilter, date: rangeFilter };
        const expenseFilter = { isDeleted: false, category: { $ne: 'income' }, ...branchFilter, date: rangeFilter };
        const resultFilter = { isDeleted: false };
        const bookFilter = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
        const attendanceFilter = { isDeleted: false, ...branchFilter, attendanceDate: rangeFilter };
        const examFilter = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
        const reportFilter = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
        const messageFilter = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
        const periodCreatedAt = { createdAt: rangeFilter };
        const branchPeriodFilter = isBranchScoped && branchObjectId
            ? { _id: branchObjectId, isDeleted: false, ...periodCreatedAt }
            : { isDeleted: false, ...periodCreatedAt };
        if (isTeacher && userId) {
            studentFilter.teacherId = userId;
            teacherFilter._id = userId;
            classFilter.assignedTeachers = userId;
            subjectFilter.teacher = userId;
            resultFilter.gradedBy = userId;
            notificationFilter.recipientRoles = { $in: ['teacher', 'all'] };
            const teacherProfile = await User_1.User.findById(userId).select('branchId').lean();
            if (teacherProfile?.branchId) {
                bookFilter.branchId = teacherProfile.branchId;
            }
        }
        if (isStudent && userId) {
            const currentUser = await User_1.User.findById(userId).select('studentId classId subjectId assignedTeacherId').lean();
            const studentRecord = currentUser?.studentId
                ? await Student_1.Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('_id classId subjectId teacherId remainingBalance').lean()
                : null;
            studentFilter._id = studentRecord?._id ? studentRecord._id : { $in: [] };
            classFilter._id = studentRecord?.classId ?? currentUser?.classId ?? { $in: [] };
            subjectFilter._id = studentRecord?.subjectId ?? currentUser?.subjectId ?? { $in: [] };
            teacherFilter._id = studentRecord?.teacherId ?? currentUser?.assignedTeacherId ?? { $in: [] };
            resultFilter.student = userId;
            paymentFilter.studentId = studentRecord?._id ? studentRecord._id : { $in: [] };
        }
        if (isFamily && userId) {
            const familyUser = await User_1.User.findById(userId).select('familyId parentProfileId').lean();
            const familyStudents = await Student_1.Student.find({
                isDeleted: false,
                ...(familyUser?.familyId ? { familyId: familyUser.familyId } : {}),
                ...(!familyUser?.familyId && familyUser?.parentProfileId ? { parentProfileId: familyUser.parentProfileId } : {})
            }).select('_id studentId classId subjectId teacherId').lean();
            const studentIds = familyStudents.map((student) => student._id);
            studentFilter._id = { $in: studentIds };
            classFilter._id = { $in: familyStudents.map((student) => student.classId).filter(Boolean) };
            subjectFilter._id = { $in: familyStudents.map((student) => student.subjectId).filter(Boolean) };
            teacherFilter._id = { $in: familyStudents.map((student) => student.teacherId).filter(Boolean) };
            const studentUsers = await User_1.User.find({
                role: 'student',
                isDeleted: false,
                studentId: { $in: familyStudents.map((student) => student.studentId).filter(Boolean) }
            }).select('_id').lean();
            resultFilter.student = { $in: studentUsers.map((student) => student._id) };
            paymentFilter.studentId = { $in: studentIds };
        }
        const studentPeriodFilter = { ...studentFilter, ...periodCreatedAt };
        const teacherPeriodFilter = { ...teacherFilter, ...periodCreatedAt };
        const classPeriodFilter = { ...classFilter, ...periodCreatedAt };
        const subjectPeriodFilter = { ...subjectFilter, ...periodCreatedAt };
        if (isLite) {
            const litePayload = await buildLiteDashboardPayload({
                period,
                startDate,
                endDate,
                role,
                isTeacher,
                isStudent,
                isFamily,
                canViewFinance,
                studentFilter,
                teacherFilter,
                classFilter,
                subjectFilter,
                notificationFilter,
                paymentFilter,
                financeEntryFilter,
                expenseFilter,
                bookFilter,
                studentPeriodFilter,
                teacherPeriodFilter,
                classPeriodFilter,
                subjectPeriodFilter
            });
            return res.json((0, response_1.createResponse)(litePayload));
        }
        const [totalStudents, totalTeachers, totalClasses, totalSubjects, totalBranches, totalBooks, totalNotifications, totalUsers, totalFamilies, paymentTotals, manualIncomeTotals, expenseTotals, studentBalance, totalAuditLogs, studentTrend, teacherTrend, monthlyPayments, monthlyManualIncome, monthlyExpenses, expenseCategoryBreakdown, totalAttendance, totalExams, totalResultsCount, totalPayments, totalFinanceEntries, totalReports, totalMessages] = await Promise.all([
            Student_1.Student.countDocuments(studentPeriodFilter),
            User_1.User.countDocuments(teacherPeriodFilter),
            Class_1.ClassModel.countDocuments(classPeriodFilter),
            Subject_1.Subject.countDocuments(subjectPeriodFilter),
            Branch_1.Branch.countDocuments(branchPeriodFilter),
            isTeacher ? Promise.resolve(0) : Book_1.Book.countDocuments(bookFilter),
            Notification_1.Notification.countDocuments(notificationFilter),
            isTeacher || isStudent || isFamily ? 1 : User_1.User.countDocuments({ isDeleted: false, ...branchFilter, ...periodCreatedAt }),
            Family_1.Family.countDocuments({ isDeleted: false, ...periodCreatedAt }),
            canViewFinance ? Payment_1.Payment.aggregate([{ $match: paymentFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]) : Promise.resolve([]),
            canViewFinance ? FinanceEntry_1.FinanceEntry.aggregate([{ $match: financeEntryFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]) : Promise.resolve([]),
            canViewFinance ? Expense_1.Expense.aggregate([{ $match: expenseFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]) : Promise.resolve([]),
            Student_1.Student.aggregate([
                { $match: studentPeriodFilter },
                { $group: { _id: null, total: { $sum: '$remainingBalance' }, totalFees: { $sum: '$feeAmount' } } }
            ]),
            isTeacher || isStudent || isFamily ? Promise.resolve(0) : AuditLog_1.AuditLog.countDocuments({ isDeleted: false, ...branchFilter, createdAt: rangeFilter }),
            Student_1.Student.aggregate([
                { $match: { ...studentFilter, createdAt: rangeFilter } },
                { $group: { _id: enrollmentGroupId(period), total: { $sum: 1 } } },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
            ]),
            User_1.User.aggregate([
                { $match: { ...teacherFilter, createdAt: rangeFilter } },
                { $group: { _id: enrollmentGroupId(period), total: { $sum: 1 } } },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
            ]),
            canViewFinance ? Payment_1.Payment.aggregate([
                { $match: paymentFilter },
                { $group: { _id: financeGroupId(period, 'paymentDate'), total: { $sum: '$amount' } } },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
            ]) : Promise.resolve([]),
            canViewFinance ? FinanceEntry_1.FinanceEntry.aggregate([
                { $match: financeEntryFilter },
                { $group: { _id: financeGroupId(period, 'date'), total: { $sum: '$amount' } } },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
            ]) : Promise.resolve([]),
            canViewFinance ? Expense_1.Expense.aggregate([
                { $match: expenseFilter },
                { $group: { _id: financeGroupId(period, 'date'), total: { $sum: '$amount' } } },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
            ]) : Promise.resolve([]),
            canViewFinance ? Expense_1.Expense.aggregate([
                { $match: expenseFilter },
                { $group: { _id: '$category', total: { $sum: '$amount' } } },
                { $sort: { total: -1 } },
                { $limit: 6 }
            ]) : Promise.resolve([]),
            isTeacher || isStudent || isFamily ? Promise.resolve(0) : Attendance_1.Attendance.countDocuments(attendanceFilter),
            isTeacher || isStudent || isFamily ? Promise.resolve(0) : Exam_1.Exam.countDocuments(examFilter),
            isTeacher || isStudent || isFamily ? Promise.resolve(0) : Result_1.Result.countDocuments({ ...resultFilter, ...periodCreatedAt }),
            canViewFinance ? Payment_1.Payment.countDocuments(paymentFilter) : Promise.resolve(0),
            canViewFinance ? FinanceEntry_1.FinanceEntry.countDocuments(financeEntryFilter) : Promise.resolve(0),
            isTeacher || isStudent || isFamily ? Promise.resolve(0) : Report_1.Report.countDocuments(reportFilter),
            isTeacher || isStudent || isFamily ? Promise.resolve(0) : Message_1.Message.countDocuments(messageFilter)
        ]);
        const enrollmentTrend = buckets.map((bucket) => ({
            year: bucket.year,
            month: bucket.month,
            day: bucket.day,
            hour: bucket.hour,
            students: findTrendTotal(period, bucket, studentTrend),
            teachers: findTrendTotal(period, bucket, teacherTrend)
        }));
        const monthlyFinances = buckets.map((bucket) => {
            const paymentTotal = findTrendTotal(period, bucket, monthlyPayments);
            const manualIncomeTotal = findTrendTotal(period, bucket, monthlyManualIncome);
            return {
                year: bucket.year,
                month: bucket.month,
                day: bucket.day,
                hour: bucket.hour,
                income: Math.round(paymentTotal + manualIncomeTotal),
                expenses: Math.round(findTrendTotal(period, bucket, monthlyExpenses))
            };
        });
        res.json((0, response_1.createResponse)({
            period,
            rangeStart: startDate.toISOString(),
            rangeEnd: endDate.toISOString(),
            totalStudents,
            totalTeachers,
            totalClasses,
            totalSubjects,
            totalBranches,
            totalBooks,
            totalNotifications,
            totalUsers,
            totalFamilies,
            incomeTotal: Math.round((paymentTotals[0]?.total ?? 0) + (manualIncomeTotals[0]?.total ?? 0)),
            expenseTotal: Math.round(expenseTotals[0]?.total ?? 0),
            outstandingBalance: Math.round(studentBalance[0]?.total ?? 0),
            totalStudentFees: Math.round(studentBalance[0]?.totalFees ?? 0),
            totalAuditLogs,
            totalAttendance,
            totalExams,
            totalResults: totalResultsCount,
            totalPayments,
            totalFinanceEntries,
            totalReports,
            totalMessages,
            enrollmentTrend,
            monthlyFinances,
            expenseCategoryBreakdown: expenseCategoryBreakdown.map((entry) => ({
                category: entry._id,
                total: entry.total
            }))
        }));
    }
    catch (error) {
        next(error);
    }
}
router.get('/', buildDashboardSummary);
router.get('/summary', buildDashboardSummary);
router.get('/master-summary', (0, auth_1.authorize)(['super_admin']), async (_req, res, next) => {
    try {
        const [users, students, teachers, classes, subjects, attendance, exams, results, payments, financeEntries, expenses, reports, branches, notifications, auditLogs, roles, courses, books, messages, curriculum] = await Promise.all([
            User_1.User.countDocuments({}),
            Student_1.Student.countDocuments({}),
            User_1.User.countDocuments({ role: 'teacher' }),
            Class_1.ClassModel.countDocuments({}),
            Subject_1.Subject.countDocuments({}),
            Attendance_1.Attendance.countDocuments({}),
            Exam_1.Exam.countDocuments({}),
            Result_1.Result.countDocuments({}),
            Payment_1.Payment.countDocuments({}),
            FinanceEntry_1.FinanceEntry.countDocuments({}),
            Expense_1.Expense.countDocuments({ category: { $ne: 'income' } }),
            Report_1.Report.countDocuments({}),
            Branch_1.Branch.countDocuments({}),
            Notification_1.Notification.countDocuments({}),
            AuditLog_1.AuditLog.countDocuments({}),
            Role_1.Role.countDocuments({}),
            Course_1.Course.countDocuments({}),
            Book_1.Book.countDocuments({}),
            Message_1.Message.countDocuments({}),
            Curriculum_1.Curriculum.countDocuments({})
        ]);
        res.json((0, response_1.createResponse)({
            users,
            students,
            teachers,
            classes,
            subjects,
            attendance,
            exams,
            results,
            payments,
            finance: financeEntries,
            expenses,
            reports,
            branches,
            notifications,
            audit: auditLogs,
            roles,
            courses,
            books,
            messages,
            curriculum
        }));
    }
    catch (error) {
        next(error);
    }
});
exports.dashboardRouter = router;
