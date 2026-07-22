import { Router } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse } from '../../helpers/response';
import { Attendance } from '../../models/Attendance';
import { AuditLog } from '../../models/AuditLog';
import { Branch } from '../../models/Branch';
import { ClassModel } from '../../models/Class';
import { Exam } from '../../models/Exam';
import { Expense } from '../../models/Expense';
import { FinanceEntry } from '../../models/FinanceEntry';
import { Payment } from '../../models/Payment';
import { Report } from '../../models/Report';
import { Result } from '../../models/Result';
import { Salary } from '../../models/Salary';
import { StationerySale } from '../../models/StationerySale';
import { Student } from '../../models/Student';
import { Subject } from '../../models/Subject';
import { User } from '../../models/User';
import { Message } from '../../models/Message';

const router = Router();

const reportSchema = Joi.object({
  body: Joi.object({
    type: Joi.string().valid('financial', 'attendance', 'academic', 'security', 'operations', 'messages').required(),
    periodKey: Joi.string().allow('', null).optional(),
    branchId: Joi.string().hex().length(24).optional()
  })
});

async function buildReportData(type: string, branchId?: string | null) {
  const branchFilter = branchId ? { branchId } : {};

  if (type === 'financial') {
    const [payments, expenses, salaries, stationerySales] = await Promise.all([
      Payment.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { isDeleted: false, category: { $ne: 'income' }, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Salary.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$netAmount' } } }]),
      StationerySale.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }])
    ]);

    return {
      totalPayments: payments[0]?.total ?? 0,
      totalExpenses: expenses[0]?.total ?? 0,
      totalSalaries: salaries[0]?.total ?? 0,
      totalStationerySales: stationerySales[0]?.total ?? 0
    };
  }

  if (type === 'attendance') {
    const [present, absent, late, suspendedStudents] = await Promise.all([
      Attendance.countDocuments({ status: 'present', isDeleted: false, ...branchFilter }),
      Attendance.countDocuments({ status: 'absent', isDeleted: false, ...branchFilter }),
      Attendance.countDocuments({ status: 'late', isDeleted: false, ...branchFilter }),
      Student.countDocuments({ status: 'suspended', isDeleted: false, ...branchFilter })
    ]);

    return { present, absent, late, suspendedStudents };
  }

  if (type === 'academic') {
    const [students, teachers, classes, subjects] = await Promise.all([
      Student.countDocuments({ isDeleted: false, ...branchFilter }),
      User.countDocuments({ role: 'teacher', isDeleted: false, ...branchFilter }),
      ClassModel.countDocuments({ isDeleted: false, ...branchFilter }),
      Subject.countDocuments({ isDeleted: false, ...branchFilter })
    ]);

    return { students, teachers, classes, subjects };
  }

  if (type === 'messages') {
    const [total, unread, students, teachers, customers] = await Promise.all([
      Message.countDocuments({ isDeleted: false, ...branchFilter }),
      Message.countDocuments({ isDeleted: false, status: 'unread', ...branchFilter }),
      Message.countDocuments({ isDeleted: false, category: 'student', ...branchFilter }),
      Message.countDocuments({ isDeleted: false, category: 'teacher', ...branchFilter }),
      Message.countDocuments({ isDeleted: false, category: 'customer', ...branchFilter })
    ]);

    return { total, unread, students, teachers, customers };
  }

  if (type === 'security') {
    const [auditEntries, lockedUsers, sessionsRevoked] = await Promise.all([
      AuditLog.countDocuments({ isDeleted: false, ...branchFilter }),
      User.countDocuments({ status: 'locked', isDeleted: false, ...branchFilter }),
      AuditLog.countDocuments({ action: { $regex: 'AUTH_LOGOUT|PASSWORD_RESET' }, isDeleted: false, ...branchFilter })
    ]);

    return { auditEntries, lockedUsers, sessionsRevoked };
  }

  const [students, teachers, classes, notifications] = await Promise.all([
    Student.countDocuments({ isDeleted: false, ...branchFilter }),
    User.countDocuments({ role: 'teacher', isDeleted: false, ...branchFilter }),
    ClassModel.countDocuments({ isDeleted: false, ...branchFilter }),
    AuditLog.countDocuments({ action: { $regex: 'NOTIFICATION' }, isDeleted: false, ...branchFilter })
  ]);

  return { students, teachers, classes, notifications };
}

router.use(authenticate);

router.get('/', authorize(['super_admin', 'admin', 'owner', 'branch_manager']), async (req, res, next) => {
  try {
    const reports = await Report.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
    res.json(createResponse(reports));
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', authorize(['super_admin', 'admin', 'owner', 'branch_manager']), async (req, res, next) => {
  try {
    const branchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : req.query.branchId;
    const branchFilter = branchId ? { branchId } : {};
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1, label: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` };
    });

    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      totalExams,
      totalResults,
      totalBranches,
      totalIncome,
      paymentTotal,
      manualIncomeTotal,
      expenseTotal,
      salaryTotal,
      attendanceSummary,
      pendingPayments,
      studentGrowthRaw,
      paymentGrowthRaw,
      expenseGrowthRaw,
      attendanceTrendRaw,
      expenseCategoryBreakdown
    ] = await Promise.all([
      Student.countDocuments({ isDeleted: false, ...branchFilter }),
      User.countDocuments({ role: 'teacher', isDeleted: false, ...branchFilter }),
      ClassModel.countDocuments({ isDeleted: false, ...branchFilter }),
      Exam.countDocuments({ isDeleted: false, ...branchFilter }),
      Result.countDocuments({ isDeleted: false, ...branchFilter }),
      branchId ? Promise.resolve(1) : Branch.countDocuments({ isDeleted: false }),
      Payment.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      FinanceEntry.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { isDeleted: false, category: { $ne: 'income' }, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Salary.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$netAmount' } } }]),
      Attendance.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
      Student.aggregate([{ $match: { isDeleted: false, remainingBalance: { $gt: 0 }, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$remainingBalance' } } }]),
      Student.aggregate([
        { $match: { isDeleted: false, createdAt: { $gte: startDate }, ...branchFilter } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { isDeleted: false, paymentDate: { $gte: startDate }, ...branchFilter } },
        { $group: { _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } }, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { isDeleted: false, category: { $ne: 'income' }, date: { $gte: startDate }, ...branchFilter } },
        { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, total: { $sum: '$amount' } } }
      ]),
      Attendance.aggregate([
        { $match: { isDeleted: false, attendanceDate: { $gte: startDate }, ...branchFilter } },
        {
          $group: {
            _id: { year: { $year: '$attendanceDate' }, month: { $month: '$attendanceDate' }, status: '$status' },
            total: { $sum: 1 }
          }
        }
      ]),
      Expense.aggregate([
        { $match: { isDeleted: false, category: { $ne: 'income' }, ...branchFilter } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 6 }
      ])
    ]);

    res.json(createResponse({
      cards: {
        totalStudents,
        totalTeachers,
        totalClasses,
        totalExams,
        totalResults,
        totalBranches,
        totalIncome: (totalIncome[0]?.total ?? 0) + (manualIncomeTotal[0]?.total ?? 0),
        monthlyRevenue: (paymentTotal[0]?.total ?? 0) + (manualIncomeTotal[0]?.total ?? 0),
        monthlyExpenses: (expenseTotal[0]?.total ?? 0) + (salaryTotal[0]?.total ?? 0),
        attendanceSummary: attendanceSummary.reduce<Record<string, number>>((acc, item: any) => {
          acc[item._id] = item.total;
          return acc;
        }, {}),
        paymentSummary: {
          totalCollected: paymentTotal[0]?.total ?? 0,
          pending: pendingPayments[0]?.total ?? 0
        }
      },
      charts: {
        studentGrowth: months.map((month) => ({
          label: month.label,
          total: studentGrowthRaw.find((entry: any) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0
        })),
        paymentGrowth: months.map((month) => ({
          label: month.label,
          total: paymentGrowthRaw.find((entry: any) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0
        })),
        expenseComparison: months.map((month) => ({
          label: month.label,
          total: expenseGrowthRaw.find((entry: any) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0
        })),
        attendanceTrend: months.map((month) => ({
          label: month.label,
          present: attendanceTrendRaw.find((entry: any) => entry._id.year === month.year && entry._id.month === month.month && entry._id.status === 'present')?.total ?? 0,
          absent: attendanceTrendRaw.find((entry: any) => entry._id.year === month.year && entry._id.month === month.month && entry._id.status === 'absent')?.total ?? 0,
          late: attendanceTrendRaw.find((entry: any) => entry._id.year === month.year && entry._id.month === month.month && entry._id.status === 'late')?.total ?? 0
        })),
        expenseBreakdown: expenseCategoryBreakdown.map((entry: any) => ({
          category: entry._id,
          total: entry.total
        }))
      }
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/generate', authorize(['super_admin', 'admin', 'owner', 'branch_manager', 'system_automation']), validate(reportSchema), async (req, res, next) => {
  try {
    const reportData = await buildReportData(req.body.type, req.body.branchId ?? req.user?.branchId ?? null);
    const report = await Report.create({
      branchId: req.body.branchId ?? req.user?.branchId ?? null,
      generatedBy: req.user?.userId ?? null,
      type: req.body.type,
      title: `${req.body.type} report`,
      periodKey: req.body.periodKey ?? new Date().toISOString().slice(0, 7),
      data: reportData,
      status: 'generated'
    });

    res.status(201).json(createResponse(report, 'Report generated successfully'));
  } catch (error) {
    next(error);
  }
});

export const reportRouter = router;
