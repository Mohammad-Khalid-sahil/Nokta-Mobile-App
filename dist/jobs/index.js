"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAutomationJobs = startAutomationJobs;
exports.stopAutomationJobs = stopAutomationJobs;
const env_1 = require("../config/env");
const Attendance_1 = require("../models/Attendance");
const AttendancePolicy_1 = require("../models/AttendancePolicy");
const AuditLog_1 = require("../models/AuditLog");
const Enrollment_1 = require("../models/Enrollment");
const Expense_1 = require("../models/Expense");
const Notification_1 = require("../models/Notification");
const Payment_1 = require("../models/Payment");
const Report_1 = require("../models/Report");
const Salary_1 = require("../models/Salary");
const SalaryTransaction_1 = require("../models/SalaryTransaction");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
const businessRuleService_1 = require("../services/businessRuleService");
const businessRuleService = new businessRuleService_1.BusinessRuleService();
const startedJobs = new Map();
function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
/** Resolve authenticated user IDs that should receive a student lifecycle alert. */
async function resolveStudentLifecycleRecipients(student) {
    const ids = new Set();
    const studentCode = String(student?.studentId ?? '').trim();
    if (studentCode) {
        const studentUser = await User_1.User.findOne({
            studentId: studentCode,
            role: 'student',
            isDeleted: false
        })
            .select('_id familyId')
            .lean();
        if (studentUser?._id) {
            ids.add(String(studentUser._id));
            if (studentUser.familyId) {
                const familyUsers = await User_1.User.find({
                    familyId: studentUser.familyId,
                    role: { $in: ['parent', 'family_student'] },
                    isDeleted: false
                })
                    .select('_id')
                    .lean();
                for (const user of familyUsers) {
                    if (user?._id)
                        ids.add(String(user._id));
                }
            }
        }
    }
    if (student?.parentProfileId) {
        const parentUsers = await User_1.User.find({
            parentProfileId: student.parentProfileId,
            role: { $in: ['parent', 'family_student'] },
            isDeleted: false
        })
            .select('_id')
            .lean();
        for (const user of parentUsers) {
            if (user?._id)
                ids.add(String(user._id));
        }
    }
    return Array.from(ids);
}
async function createPrivateStudentLifecycleNotification(input) {
    const now = new Date();
    const recipientIds = await resolveStudentLifecycleRecipients(input.student);
    const recipientRoles = input.includeStaffRoles
        ? ['admin', 'branch_manager']
        : [];
    // Always private — never enter the public academy feed.
    await Notification_1.Notification.create({
        branchId: input.student?.branchId ?? null,
        title: input.title,
        description: input.description,
        message: input.description,
        recipientRoles,
        recipientIds,
        publishStatus: 'published',
        publishDate: now,
        category: input.category ?? 'academic_reminder',
        priority: input.priority ?? 'high',
        severity: input.severity ?? 'warning',
        isPublic: false,
        visibility: 'private',
        metadata: {
            ...(input.metadata ?? {}),
            studentId: input.student?._id,
            privateLifecycle: true
        }
    });
}
async function onlineAttendanceAutoMark() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const policies = await AttendancePolicy_1.AttendancePolicy.find({ active: true, onlineAutoMarkEnabled: true, isDeleted: false }).lean();
    if (!policies.length) {
        return;
    }
    const enrollments = await Enrollment_1.Enrollment.find({
        status: 'active',
        isDeleted: false,
        $or: [{ registrationExpiryDate: null }, { registrationExpiryDate: { $gte: today } }]
    }).lean();
    for (const enrollment of enrollments) {
        const exists = await Attendance_1.Attendance.exists({
            studentId: enrollment.studentId,
            attendanceDate: today,
            session: 'online',
            isDeleted: false
        });
        if (!exists) {
            await Attendance_1.Attendance.create({
                studentId: enrollment.studentId,
                classId: enrollment.classId,
                teacherId: enrollment.teacherId,
                branchId: enrollment.branchId ?? null,
                policyId: policies.find((policy) => String(policy.branchId ?? '') === String(enrollment.branchId ?? ''))?._id ?? policies[0]._id,
                attendanceDate: today,
                session: 'online',
                status: 'online_auto_marked',
                source: 'automation'
            });
        }
    }
}
async function registrationExpiryReminder() {
    const today = new Date();
    const reminderDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    const students = await Student_1.Student.find({
        registrationExpiryDate: { $lte: reminderDate, $gte: today },
        warningSentAt: null,
        status: { $ne: 'graduated' },
        isDeleted: false
    }).lean();
    for (const student of students) {
        const daysRemaining = Math.max(0, Math.ceil((new Date(student.registrationExpiryDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
        await Promise.all([
            Student_1.Student.updateOne({ _id: student._id }, { $set: { warningSentAt: today, accountStatus: 'warning' } }),
            Notification_1.Notification.create({
                branchId: student.branchId ?? null,
                title: 'Registration expiry reminder',
                description: `Only ${daysRemaining} days remain from your registration.`,
                message: `Only ${daysRemaining} days remain from your registration.`,
                recipientRoles: ['student', 'parent', 'admin', 'owner', 'branch_manager'],
                recipientIds: [],
                publishStatus: 'published',
                publishDate: today,
                category: 'academic_reminder',
                priority: 'high',
                metadata: { studentId: student._id, daysRemaining }
            }),
            createLifecycleAudit('STUDENT_REGISTRATION_WARNING_SENT', student, { daysRemaining })
        ]);
    }
}
async function reminderBroadcast() {
    const policies = await AttendancePolicy_1.AttendancePolicy.find({ active: true, isDeleted: false }).lean();
    if (!policies.length) {
        return;
    }
    await Notification_1.Notification.create({
        title: 'Automation reminder dispatch',
        description: 'Scheduled registration, attendance, and finance reminders were processed successfully.',
        message: 'Scheduled registration, attendance, and finance reminders were processed successfully.',
        recipientRoles: ['super_admin', 'owner', 'system_automation'],
        recipientIds: [],
        publishStatus: 'published',
        publishDate: new Date()
    });
}
async function monthlySalaryCalculation() {
    const teachers = await User_1.User.find({ role: 'teacher', active: true, isDeleted: false }).lean();
    const currentMonthKey = monthKey();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    for (const teacher of teachers) {
        const existing = await Salary_1.Salary.exists({ employeeId: teacher._id, monthKey: currentMonthKey, isDeleted: false });
        if (existing) {
            continue;
        }
        const salaryTransactions = await SalaryTransaction_1.SalaryTransaction.aggregate([
            {
                $match: {
                    teacherId: teacher._id,
                    createdAt: { $gte: monthStart, $lt: nextMonthStart }
                }
            },
            { $group: { _id: null, total: { $sum: '$earnedAmount' } } }
        ]);
        const teacherAbsences = await AuditLog_1.AuditLog.countDocuments({
            actor: teacher._id,
            action: 'TEACHER_ABSENT',
            createdAt: { $gte: monthStart, $lt: nextMonthStart },
            isDeleted: false
        });
        const deduction = businessRuleService.calculateTeacherAbsenceDeduction(teacherAbsences, 50);
        const baseAmount = teacher.salaryType === 'fixed' ? Number(teacher.fixedSalary || 0) : Number(salaryTransactions[0]?.total ?? 0);
        const netAmount = Math.max(0, baseAmount - deduction);
        await Salary_1.Salary.create({
            employeeId: teacher._id,
            branchId: teacher.branchId ?? null,
            monthKey: currentMonthKey,
            baseAmount,
            deductions: deduction,
            deductionsDetail: deduction ? [{ reason: 'Teacher absence penalty', amount: deduction }] : [],
            netAmount
        });
    }
}
async function autoSuspensionJob() {
    const policies = await AttendancePolicy_1.AttendancePolicy.find({ active: true, isDeleted: false }).lean();
    for (const policy of policies) {
        const threshold = Number(policy.absenceSuspensionThreshold || 0);
        if (!threshold) {
            continue;
        }
        const suspendedStudents = await Attendance_1.Attendance.aggregate([
            {
                $match: {
                    branchId: policy.branchId ?? null,
                    status: 'absent',
                    isDeleted: false
                }
            },
            { $group: { _id: '$studentId', total: { $sum: 1 } } },
            { $match: { total: { $gte: threshold } } }
        ]);
        const ids = suspendedStudents.map((entry) => entry._id);
        if (ids.length) {
            await Student_1.Student.updateMany({ _id: { $in: ids } }, { $set: { status: 'suspended' } });
        }
    }
}
async function monthlyFinancialReports() {
    const currentPeriodKey = monthKey();
    const existing = await Report_1.Report.exists({ type: 'financial', periodKey: currentPeriodKey, isDeleted: false });
    if (existing) {
        return;
    }
    const [payments, expenses, salaries] = await Promise.all([
        Payment_1.Payment.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Expense_1.Expense.aggregate([{ $match: { isDeleted: false, category: { $ne: 'income' } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Salary_1.Salary.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: null, total: { $sum: '$netAmount' } } }])
    ]);
    await Report_1.Report.create({
        type: 'financial',
        title: 'Monthly financial report',
        periodKey: currentPeriodKey,
        data: {
            totalPayments: payments[0]?.total ?? 0,
            totalExpenses: expenses[0]?.total ?? 0,
            totalSalaries: salaries[0]?.total ?? 0
        },
        status: 'generated'
    });
}
async function auditAlerts() {
    const recentCriticalChanges = await AuditLog_1.AuditLog.find({
        severity: 'critical',
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        isDeleted: false
    }).lean();
    if (!recentCriticalChanges.length) {
        return;
    }
    await Notification_1.Notification.create({
        title: 'Critical audit alert',
        description: `${recentCriticalChanges.length} critical audit events were detected in the last hour.`,
        message: `${recentCriticalChanges.length} critical audit events were detected in the last hour.`,
        recipientRoles: ['super_admin', 'owner'],
        recipientIds: [],
        publishStatus: 'published',
        publishDate: new Date()
    });
}
const jobs = [
    { name: 'online-attendance-auto-mark', intervalMs: 60 * 60 * 1000, run: onlineAttendanceAutoMark },
    { name: 'registration-expiry-reminder', intervalMs: 12 * 60 * 60 * 1000, run: registrationExpiryReminder },
    { name: 'student-registration-lifecycle', intervalMs: 6 * 60 * 60 * 1000, run: studentRegistrationLifecycle },
    { name: 'reminder-broadcast', intervalMs: 24 * 60 * 60 * 1000, run: reminderBroadcast },
    { name: 'monthly-salary-calculation', intervalMs: 24 * 60 * 60 * 1000, run: monthlySalaryCalculation },
    { name: 'auto-suspension', intervalMs: 6 * 60 * 60 * 1000, run: autoSuspensionJob },
    { name: 'monthly-financial-reports', intervalMs: 24 * 60 * 60 * 1000, run: monthlyFinancialReports },
    { name: 'audit-alerts', intervalMs: 60 * 60 * 1000, run: auditAlerts }
];
function startAutomationJobs() {
    if (!env_1.config.enableJobs) {
        return;
    }
    for (const job of jobs) {
        if (startedJobs.has(job.name)) {
            continue;
        }
        void job.run().catch((error) => {
            console.error(`[JOB:${job.name}] initial run failed`, error);
        });
        const handle = setInterval(() => {
            void job.run().catch((error) => {
                console.error(`[JOB:${job.name}] scheduled run failed`, error);
            });
        }, job.intervalMs);
        startedJobs.set(job.name, handle);
    }
}
async function studentRegistrationLifecycle() {
    const now = new Date();
    const warningEnd = new Date(now);
    warningEnd.setDate(warningEnd.getDate() + 3);
    const blockCutoff = new Date(now);
    blockCutoff.setDate(blockCutoff.getDate() - 5);
    const warningStudents = await Student_1.Student.find({
        isDeleted: false,
        accountStatus: 'active',
        registrationEndDate: { $gte: now, $lte: warningEnd },
        warningSentAt: null
    }).lean();
    for (const student of warningStudents) {
        const daysRemaining = Math.max(0, Math.ceil((new Date(student.registrationEndDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
        await Promise.all([
            Student_1.Student.updateOne({ _id: student._id }, { $set: { accountStatus: 'warning', warningSentAt: now } }),
            createPrivateStudentLifecycleNotification({
                student,
                title: 'Registration expiry warning',
                description: `Only ${daysRemaining} days remain from your registration.`,
                category: 'academic_reminder',
                priority: 'high',
                severity: 'warning',
                metadata: { daysRemaining }
            }),
            createLifecycleAudit('STUDENT_REGISTRATION_WARNING_SENT', student, { daysRemaining })
        ]);
    }
    const expiringStudents = await Student_1.Student.find({
        isDeleted: false,
        accountStatus: { $in: ['active', 'warning'] },
        registrationEndDate: { $lt: now }
    }).lean();
    for (const student of expiringStudents) {
        await Promise.all([
            Student_1.Student.updateOne({ _id: student._id }, { $set: { accountStatus: 'expired' } }),
            createPrivateStudentLifecycleNotification({
                student,
                title: 'Registration expired',
                description: 'Your registration period has ended.',
                category: 'academic_reminder',
                priority: 'high',
                severity: 'warning',
                includeStaffRoles: true
            }),
            createLifecycleAudit('STUDENT_REGISTRATION_EXPIRED', student)
        ]);
    }
    const blockStudents = await Student_1.Student.find({
        isDeleted: false,
        accountStatus: 'expired',
        registrationEndDate: { $lte: blockCutoff }
    }).lean();
    for (const student of blockStudents) {
        await Promise.all([
            Student_1.Student.updateOne({ _id: student._id }, { $set: { accountStatus: 'blocked', blockedAt: now, status: 'inactive' } }),
            User_1.User.updateOne({ studentId: student.studentId, role: 'student', isDeleted: false }, { $set: { status: 'blocked', active: false } }),
            createPrivateStudentLifecycleNotification({
                student,
                title: 'Student account blocked',
                description: 'Student account has been blocked because registration expired.',
                category: 'academic_reminder',
                priority: 'urgent',
                severity: 'critical',
                includeStaffRoles: true
            }),
            createLifecycleAudit('STUDENT_ACCOUNT_AUTO_BLOCKED', student)
        ]);
    }
}
async function createLifecycleAudit(action, student, metadata = {}) {
    const actor = (await User_1.User.findOne({ role: { $in: ['system_automation', 'super_admin'] }, isDeleted: false }).select('_id').lean())?._id;
    if (!actor)
        return;
    await AuditLog_1.AuditLog.create({
        actor,
        branchId: student?.branchId ?? null,
        action,
        target: String(student?._id ?? ''),
        targetType: 'student',
        severity: action.includes('BLOCKED') ? 'critical' : 'warning',
        metadata
    });
}
function stopAutomationJobs() {
    for (const handle of startedJobs.values()) {
        clearInterval(handle);
    }
    startedJobs.clear();
}
