import { Router } from 'express';
import Joi from 'joi';
import { Expense } from '../../models/Expense';
import { Salary } from '../../models/Salary';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import { paginationSchema } from '../../validators/pagination';

const router = Router();
const expenseSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().required(),
    amount: Joi.number().positive().required(),
    category: Joi.string().required(),
    date: Joi.date().optional(),
    notes: Joi.string().allow('', null)
  })
});

router.use(authenticate, authorize(['super_admin', 'admin', 'accountant', 'branch_manager', 'owner']));

router.post('/', validate(expenseSchema), async (req, res, next) => {
  try {
    if (String(req.body.category).toLowerCase() === 'income') {
      return res.status(400).json(createError('Income entries are not allowed in the expense module'));
    }

    const expense = await Expense.create(req.body);
    res.status(201).json(createResponse(expense, 'Expense recorded'));
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (_req, res, next) => {
  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);

    const [expenseTotals, salaryTotals, monthlyExpenses, categoryBreakdown] = await Promise.all([
      Expense.aggregate([
        { $match: { isDeleted: false, category: { $ne: 'income' } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Salary.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$netAmount' } } }
      ]),
      Expense.aggregate([
        { $match: { isDeleted: false, category: { $ne: 'income' }, date: { $gte: startDate } } },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            total: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      Expense.aggregate([
        { $match: { isDeleted: false, category: { $ne: 'income' } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } }
      ])
    ]);

    res.json(createResponse({
      totalExpenses: expenseTotals[0]?.total ?? 0,
      teacherSalaries: salaryTotals[0]?.total ?? 0,
      monthlyExpenses: monthlyExpenses.map((entry: any) => ({
        year: entry._id.year,
        month: entry._id.month,
        total: entry.total
      })),
      categories: categoryBreakdown.map((entry: any) => ({
        category: entry._id,
        total: entry.total
      }))
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/', validate(paginationSchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const [expenses, total] = await Promise.all([
      Expense.find({ isDeleted: false, category: { $ne: 'income' } }).lean().sort({ date: -1 }).skip((page - 1) * limit).limit(limit),
      Expense.countDocuments({ isDeleted: false, category: { $ne: 'income' } })
    ]);
    res.json(createResponse(expenses, '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

export const expenseRouter = router;
