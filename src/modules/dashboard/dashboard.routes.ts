import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middlewares/auth';
import { createResponse } from '../../helpers/response';
import { AuditLog } from '../../models/AuditLog';
import { Book } from '../../models/Book';
import { Branch } from '../../models/Branch';
import { ClassModel } from '../../models/Class';
import { Attendance } from '../../models/Attendance';
import { Expense } from '../../models/Expense';
import { Family } from '../../models/Family';
import { FinanceEntry } from '../../models/FinanceEntry';
import { Notification } from '../../models/Notification';
import { Payment } from '../../models/Payment';
import { Report } from '../../models/Report';
import { Result } from '../../models/Result';
import { Role } from '../../models/Role';
import { Subject } from '../../models/Subject';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { Exam } from '../../models/Exam';
import { Message } from '../../models/Message';
import { Curriculum } from '../../models/Curriculum';
import { Course } from '../../models/Course';
import { logger } from '../../utils/logger';
import {
  buildTrendBuckets,
  dateRangeFilter,
  getDashboardDateRange,
  matchTrendBucket,
  parseDashboardPeriod,
  type DashboardPeriod
} from './dashboardPeriod';

const router = Router();
const DASHBOARD_TZ = 'Asia/Kabul';

router.use(authenticate, authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'accountant', 'librarian', 'student', 'family_student', 'parent', 'owner']));

function datePart(field: string, operator: '$year' | '$month' | '$dayOfMonth' | '$hour') {
  return { [operator]: { date: field.startsWith('$') ? field : `$${field}`, timezone: DASHBOARD_TZ } };
}

function enrollmentGroupId(period: DashboardPeriod) {
  if (period === 'day') {
    return {
      year: datePart('createdAt', '$year'),
      month: datePart('createdAt', '$month'),
      day: datePart('createdAt', '$dayOfMonth'),
      hour: datePart('createdAt', '$hour')
    };
  }
  if (period === 'month') {
    return {
      year: datePart('createdAt', '$year'),
      month: datePart('createdAt', '$month'),
      day: datePart('createdAt', '$dayOfMonth')
    };
  }
  return {
    year: datePart('createdAt', '$year'),
    month: datePart('createdAt', '$month')
  };
}

function financeGroupId(period: DashboardPeriod, dateField: string) {
  if (period === 'day') {
    return {
      year: datePart(dateField, '$year'),
      month: datePart(dateField, '$month'),
      day: datePart(dateField, '$dayOfMonth'),
      hour: datePart(dateField, '$hour')
    };
  }
  if (period === 'month') {
    return {
      year: datePart(dateField, '$year'),
      month: datePart(dateField, '$month'),
      day: datePart(dateField, '$dayOfMonth')
    };
  }
  return {
    year: datePart(dateField, '$year'),
    month: datePart(dateField, '$month')
  };
}

function findTrendTotal(
  period: DashboardPeriod,
  bucket: { year: number; month: number; day?: number; hour?: number },
  entries: Array<{ _id: Record<string, number>; total: number }>
) {
  return (
    entries.find((entry) =>
      matchTrendBucket(period, bucket, {
        year: entry._id.year,
        month: entry._id.month,
        day: entry._id.day,
        hour: entry._id.hour
      })
    )?.total ?? 0
  );
}

function emptyTrendPayload(period: DashboardPeriod, startDate: Date, endDate: Date) {
  return {
    period,
    rangeStart: startDate.toISOString(),
    rangeEnd: endDate.toISOString(),
    enrollmentTrend: [] as Array<Record<string, number>>,
    monthlyFinances: [] as Array<Record<string, number>>,
    expenseCategoryBreakdown: [] as Array<{ category: string; total: number }>
  };
}

async function buildLiteDashboardPayload(input: {
  period: DashboardPeriod;
  startDate: Date;
  endDate: Date;
  role: string | undefined;
  isTeacher: boolean;
  isStudent: boolean;
  isFamily: boolean;
  canViewFinance: boolean;
  studentFilter: Record<string, any>;
  teacherFilter: Record<string, any>;
  classFilter: Record<string, any>;
  subjectFilter: Record<string, any>;
  notificationFilter: Record<string, any>;
  paymentFilter: Record<string, any>;
  financeEntryFilter: Record<string, any>;
  expenseFilter: Record<string, any>;
  bookFilter: Record<string, any>;
  studentPeriodFilter: Record<string, any>;
  teacherPeriodFilter: Record<string, any>;
  classPeriodFilter: Record<string, any>;
  subjectPeriodFilter: Record<string, any>;
}) {
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
      Student.countDocuments(input.studentPeriodFilter),
      ClassModel.countDocuments(input.classPeriodFilter),
      Subject.countDocuments(input.subjectPeriodFilter)
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
      Student.countDocuments(input.studentPeriodFilter),
      ClassModel.countDocuments(input.classPeriodFilter),
      Student.aggregate([
        { $match: input.studentPeriodFilter },
        { $group: { _id: null, total: { $sum: '$remainingBalance' }, totalFees: { $sum: '$feeAmount' } } }
      ]),
      Notification.countDocuments(input.notificationFilter)
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
    const totalBooks = await Book.countDocuments(input.bookFilter);
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
        Payment.aggregate([{ $match: input.paymentFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        FinanceEntry.aggregate([{ $match: input.financeEntryFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Expense.aggregate([{ $match: input.expenseFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Payment.countDocuments(input.paymentFilter)
      ])
    : [[], [], [], 0] as const;

  const [paymentTotals, manualIncomeTotals, expenseTotals, totalPayments] = financeQueries;

  const [totalStudents, totalTeachers, totalClasses, studentBalance, totalBooks] = await Promise.all([
    Student.countDocuments(input.studentPeriodFilter),
    User.countDocuments(input.teacherPeriodFilter),
    ClassModel.countDocuments(input.classPeriodFilter),
    Student.aggregate([
      { $match: input.studentPeriodFilter },
      { $group: { _id: null, total: { $sum: '$remainingBalance' }, totalFees: { $sum: '$feeAmount' } } }
    ]),
    input.role === 'owner' ? Book.countDocuments({ isDeleted: false }) : Promise.resolve(0)
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
    totalPayments: typeof totalPayments === 'number' ? totalPayments : 0,
    paymentTotal: Math.round(paymentTotals[0]?.total ?? 0)
  };
}

async function buildDashboardSummary(req: any, res: any, next: any) {
  try {
    const period = parseDashboardPeriod(req.query?.period);
    const isLite = req.query?.lite === '1' || req.query?.lite === 'true';
    const now = new Date();
    const { start: startDate, end: endDate } = getDashboardDateRange(period, now);
    const rangeFilter = dateRangeFilter(startDate, endDate);
    const buckets = buildTrendBuckets(period, { start: startDate, end: endDate });
    const role = req.user?.canonicalRole ?? req.user?.role;
    const userId = req.user?.userId;
    const branchId = req.user?.branchId;
    const isTeacher = role === 'teacher';
    const isStudent = role === 'student';
    const isFamily = role === 'parent' || role === 'family_student' || role === 'family';
    const isBranchScoped = role === 'branch_manager' && branchId;
    const canViewFinance = ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(String(role));

    const branchObjectId = branchId && mongoose.Types.ObjectId.isValid(branchId)
      ? new mongoose.Types.ObjectId(branchId)
      : null;
    const branchFilter = isBranchScoped && branchObjectId ? { branchId: branchObjectId } : {};
    const studentFilter: Record<string, any> = { isDeleted: false, ...branchFilter };
    const teacherFilter: Record<string, any> = { role: 'teacher', isDeleted: false, ...branchFilter };
    const classFilter: Record<string, any> = { isDeleted: false, ...branchFilter };
    const subjectFilter: Record<string, any> = { isDeleted: false, ...branchFilter };
    const notificationFilter: Record<string, any> = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
    const paymentFilter: Record<string, any> = { isDeleted: false, ...branchFilter, paymentDate: rangeFilter };
    const financeEntryFilter: Record<string, any> = { isDeleted: false, ...branchFilter, date: rangeFilter };
    const expenseFilter: Record<string, any> = { isDeleted: false, category: { $ne: 'income' }, ...branchFilter, date: rangeFilter };
    const resultFilter: Record<string, any> = { isDeleted: false };
    const bookFilter: Record<string, any> = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
    const attendanceFilter: Record<string, any> = { isDeleted: false, ...branchFilter, attendanceDate: rangeFilter };
    const examFilter: Record<string, any> = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
    const reportFilter: Record<string, any> = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
    const messageFilter: Record<string, any> = { isDeleted: false, ...branchFilter, createdAt: rangeFilter };
    const periodCreatedAt = { createdAt: rangeFilter };
    const branchPeriodFilter: Record<string, any> = isBranchScoped && branchObjectId
      ? { _id: branchObjectId, isDeleted: false, ...periodCreatedAt }
      : { isDeleted: false, ...periodCreatedAt };

    if (isTeacher && userId) {
      studentFilter.teacherId = userId;
      teacherFilter._id = userId;
      classFilter.assignedTeachers = userId;
      subjectFilter.teacher = userId;
      resultFilter.gradedBy = userId;
      notificationFilter.recipientRoles = { $in: ['teacher', 'all'] };
      const teacherProfile = await User.findById(userId).select('branchId').lean<Record<string, any>>();
      if (teacherProfile?.branchId) {
        bookFilter.branchId = teacherProfile.branchId;
      }
    }

    if (isStudent && userId) {
      const currentUser = await User.findById(userId).select('studentId classId subjectId assignedTeacherId').lean<Record<string, any>>();
      const studentRecord = currentUser?.studentId
        ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('_id classId subjectId teacherId remainingBalance').lean<Record<string, any>>()
        : null;
      studentFilter._id = studentRecord?._id ? studentRecord._id : { $in: [] };
      classFilter._id = studentRecord?.classId ?? currentUser?.classId ?? { $in: [] };
      subjectFilter._id = studentRecord?.subjectId ?? currentUser?.subjectId ?? { $in: [] };
      teacherFilter._id = studentRecord?.teacherId ?? currentUser?.assignedTeacherId ?? { $in: [] };
      resultFilter.student = userId;
      paymentFilter.studentId = studentRecord?._id ? studentRecord._id : { $in: [] };
    }

    if (isFamily && userId) {
      const familyUser = await User.findById(userId).select('familyId parentProfileId').lean<Record<string, any>>();
      const familyStudents = await Student.find({
        isDeleted: false,
        ...(familyUser?.familyId ? { familyId: familyUser.familyId } : {}),
        ...(!familyUser?.familyId && familyUser?.parentProfileId ? { parentProfileId: familyUser.parentProfileId } : {})
      }).select('_id studentId classId subjectId teacherId').lean<Record<string, any>[]>();
      const studentIds = familyStudents.map((student) => student._id);
      studentFilter._id = { $in: studentIds };
      classFilter._id = { $in: familyStudents.map((student) => student.classId).filter(Boolean) };
      subjectFilter._id = { $in: familyStudents.map((student) => student.subjectId).filter(Boolean) };
      teacherFilter._id = { $in: familyStudents.map((student) => student.teacherId).filter(Boolean) };
      const studentUsers = await User.find({
        role: 'student',
        isDeleted: false,
        studentId: { $in: familyStudents.map((student: any) => student.studentId).filter(Boolean) }
      }).select('_id').lean<Record<string, any>[]>();
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
      return res.json(createResponse(litePayload));
    }

    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubjects,
      totalBranches,
      totalBooks,
      totalNotifications,
      totalUsers,
      totalFamilies,
      paymentTotals,
      manualIncomeTotals,
      expenseTotals,
      studentBalance,
      totalAuditLogs,
      studentTrend,
      teacherTrend,
      monthlyPayments,
      monthlyManualIncome,
      monthlyExpenses,
      expenseCategoryBreakdown,
      totalAttendance,
      totalExams,
      totalResultsCount,
      totalPayments,
      totalFinanceEntries,
      totalReports,
      totalMessages,
      totalCourses,
      totalCurriculum,
      totalRoles
    ] = await Promise.all([
      Student.countDocuments(studentPeriodFilter),
      User.countDocuments(teacherPeriodFilter),
      ClassModel.countDocuments(classPeriodFilter),
      Subject.countDocuments(subjectPeriodFilter),
      Branch.countDocuments(branchPeriodFilter),
      isTeacher ? Promise.resolve(0) : Book.countDocuments(bookFilter),
      Notification.countDocuments(notificationFilter),
      isTeacher || isStudent || isFamily ? 1 : User.countDocuments({ isDeleted: false, ...branchFilter, ...periodCreatedAt }),
      Family.countDocuments({ isDeleted: false, ...periodCreatedAt }),
      canViewFinance ? Payment.aggregate([{ $match: paymentFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]) : Promise.resolve([]),
      canViewFinance ? FinanceEntry.aggregate([{ $match: financeEntryFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]) : Promise.resolve([]),
      canViewFinance ? Expense.aggregate([{ $match: expenseFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]) : Promise.resolve([]),
      Student.aggregate([
        { $match: studentPeriodFilter },
        { $group: { _id: null, total: { $sum: '$remainingBalance' }, totalFees: { $sum: '$feeAmount' } } }
      ]),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : AuditLog.countDocuments({ isDeleted: false, ...branchFilter, createdAt: rangeFilter }),
      Student.aggregate([
        { $match: { ...studentFilter, createdAt: rangeFilter } },
        { $group: { _id: enrollmentGroupId(period), total: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]),
      User.aggregate([
        { $match: { ...teacherFilter, createdAt: rangeFilter } },
        { $group: { _id: enrollmentGroupId(period), total: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]),
      canViewFinance ? Payment.aggregate([
        { $match: paymentFilter },
        { $group: { _id: financeGroupId(period, 'paymentDate'), total: { $sum: '$amount' } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]) : Promise.resolve([]),
      canViewFinance ? FinanceEntry.aggregate([
        { $match: financeEntryFilter },
        { $group: { _id: financeGroupId(period, 'date'), total: { $sum: '$amount' } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]) : Promise.resolve([]),
      canViewFinance ? Expense.aggregate([
        { $match: expenseFilter },
        { $group: { _id: financeGroupId(period, 'date'), total: { $sum: '$amount' } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]) : Promise.resolve([]),
      canViewFinance ? Expense.aggregate([
        { $match: expenseFilter },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 6 }
      ]) : Promise.resolve([]),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Attendance.countDocuments(attendanceFilter),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Exam.countDocuments(examFilter),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Result.countDocuments({ ...resultFilter, ...periodCreatedAt }),
      canViewFinance ? Payment.countDocuments(paymentFilter) : Promise.resolve(0),
      canViewFinance ? FinanceEntry.countDocuments(financeEntryFilter) : Promise.resolve(0),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Report.countDocuments(reportFilter),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Message.countDocuments(messageFilter),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Course.countDocuments({ isDeleted: false, ...periodCreatedAt }),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Curriculum.countDocuments({ isDeleted: false, ...periodCreatedAt }),
      isTeacher || isStudent || isFamily ? Promise.resolve(0) : Role.countDocuments({})
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

    const expenseCategoryBreakdownMapped = expenseCategoryBreakdown
      .map((entry: { _id: string | null; total: number }) => ({
        category: entry._id == null || entry._id === '' ? 'other' : String(entry._id),
        total: Math.round(Number(entry.total) || 0)
      }))
      .filter((entry: { category: string; total: number }) => entry.total > 0);

    const cashFlowSignal = monthlyFinances.reduce(
      (sum, row) => sum + (Number(row.income) || 0) + (Number(row.expenses) || 0),
      0
    );
    const enrollmentSignal = enrollmentTrend.reduce(
      (sum, row) => sum + (Number(row.students) || 0) + (Number(row.teachers) || 0),
      0
    );

    logger.info('Admin dashboard analytics', {
      requestUrl: req.originalUrl || req.url,
      requestParameters: { period, lite: req.query?.lite ?? null },
      userId,
      role,
      responseStatus: 200,
      rangeStart: startDate.toISOString(),
      rangeEnd: endDate.toISOString(),
      timezone: DASHBOARD_TZ,
      cashFlowBuckets: monthlyFinances.length,
      cashFlowSignal,
      enrollmentBuckets: enrollmentTrend.length,
      enrollmentSignal,
      expenseCategories: expenseCategoryBreakdownMapped.length,
      incomeTotal: Math.round((paymentTotals[0]?.total ?? 0) + (manualIncomeTotals[0]?.total ?? 0)),
      expenseTotal: Math.round(expenseTotals[0]?.total ?? 0),
      responseBodySummary: {
        monthlyFinancesNonZero: monthlyFinances.filter((row) => (row.income || 0) > 0 || (row.expenses || 0) > 0).length,
        enrollmentNonZero: enrollmentTrend.filter((row) => (row.students || 0) > 0 || (row.teachers || 0) > 0).length,
        expenseCategoryBreakdown: expenseCategoryBreakdownMapped
      }
    });

    res.json(createResponse({
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
      paymentTotal: Math.round(paymentTotals[0]?.total ?? 0),
      totalFinanceEntries,
      totalReports,
      totalMessages,
      totalCourses,
      totalCurriculum,
      totalRoles,
      enrollmentTrend,
      monthlyFinances,
      expenseCategoryBreakdown: expenseCategoryBreakdownMapped
    }));
  } catch (error) {
    logger.error('Admin dashboard analytics failed', error, {
      requestUrl: req.originalUrl || req.url,
      requestParameters: req.query,
      userId: req.user?.userId,
      role: req.user?.canonicalRole ?? req.user?.role
    });
    next(error);
  }
}

router.get('/', buildDashboardSummary);
router.get('/summary', buildDashboardSummary);

router.get('/master-summary', authorize(['super_admin']), async (_req, res, next) => {
  try {
    const [
      users,
      students,
      teachers,
      classes,
      subjects,
      attendance,
      exams,
      results,
      payments,
      financeEntries,
      expenses,
      reports,
      branches,
      notifications,
      auditLogs,
      roles,
      courses,
      books,
      messages,
      curriculum
    ] = await Promise.all([
      User.countDocuments({}),
      Student.countDocuments({}),
      User.countDocuments({ role: 'teacher' }),
      ClassModel.countDocuments({}),
      Subject.countDocuments({}),
      Attendance.countDocuments({}),
      Exam.countDocuments({}),
      Result.countDocuments({}),
      Payment.countDocuments({}),
      FinanceEntry.countDocuments({}),
      Expense.countDocuments({ category: { $ne: 'income' } }),
      Report.countDocuments({}),
      Branch.countDocuments({}),
      Notification.countDocuments({}),
      AuditLog.countDocuments({}),
      Role.countDocuments({}),
      Course.countDocuments({}),
      Book.countDocuments({}),
      Message.countDocuments({}),
      Curriculum.countDocuments({})
    ]);

    res.json(createResponse({
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
  } catch (error) {
    next(error);
  }
});

export const dashboardRouter = router;
