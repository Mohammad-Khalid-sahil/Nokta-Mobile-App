"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payrollRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const SalarySetting_1 = require("../../models/SalarySetting");
const SalaryRecord_1 = require("../../models/SalaryRecord");
const TaxRule_1 = require("../../models/TaxRule");
const User_1 = require("../../models/User");
const Branch_1 = require("../../models/Branch");
const afghanistanSalaryTaxService_1 = require("../../services/afghanistanSalaryTaxService");
const payrollCalculation_service_1 = require("../../services/payrollCalculation.service");
const router = (0, express_1.Router)();
const settingSchema = joi_1.default.object({
    body: joi_1.default.object({
        userId: joi_1.default.string().hex().length(24).required(),
        role: joi_1.default.string().valid('teacher', 'admin', 'manager').required(),
        branchId: joi_1.default.string().hex().length(24).allow(null, '').optional(),
        salaryType: joi_1.default.string().valid('fixed', 'percentage', 'fixed_plus_percentage').required(),
        fixedAmount: joi_1.default.number().min(0).required(),
        percentage: joi_1.default.number().min(0).max(100).required(),
        percentageScope: joi_1.default.string().valid('branch', 'all_system').required(),
        isActive: joi_1.default.boolean().optional()
    })
});
const calculateSchema = joi_1.default.object({
    body: joi_1.default.object({
        userId: joi_1.default.string().hex().length(24).required(),
        hijriYear: joi_1.default.number().required(),
        hijriMonth: joi_1.default.number().min(1).max(12).required(),
        recalculate: joi_1.default.boolean().optional()
    })
});
const taxRuleSchema = joi_1.default.object({
    body: joi_1.default.object({
        minAmount: joi_1.default.number().min(0).required(),
        maxAmount: joi_1.default.number().min(0).allow(null).required(),
        baseTax: joi_1.default.number().min(0).required(),
        percentage: joi_1.default.number().min(0).max(100).required(),
        categoryNameDari: joi_1.default.string().required(),
        explanationDari: joi_1.default.string().required(),
        isActive: joi_1.default.boolean().required(),
        effectiveFrom: joi_1.default.date().required(),
        effectiveTo: joi_1.default.date().allow(null).optional()
    })
});
router.use(auth_1.authenticate);
function formatAccounting(value) {
    const amount = Number(value || 0);
    const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amount < 0 ? `(${abs})` : abs;
}
function canEditTaxRules(req) {
    return req.user?.canonicalRole === 'super_admin' || req.user?.role === 'super_admin';
}
router.get('/summary', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)();
        const hijriYear = Number(req.query.year || year);
        const hijriMonth = Number(req.query.month || month);
        const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
        const filter = { hijriYear, hijriMonth, isDeleted: false };
        if (branchId)
            filter.branchId = branchId;
        if (req.user?.canonicalRole === 'branch_manager' && req.user?.branchId)
            filter.branchId = req.user.branchId;
        await (0, payrollCalculation_service_1.ensureSalaryRecordsForPeriod)({
            hijriYear,
            hijriMonth,
            branchId: filter.branchId ? String(filter.branchId) : undefined,
            actorId: req.user?.userId ?? null
        });
        const records = await SalaryRecord_1.SalaryRecord.find(filter).lean();
        const totalGross = records.reduce((sum, item) => sum + Number(item.grossSalary || 0), 0);
        const totalTax = records.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
        const totalNet = records.reduce((sum, item) => sum + Number(item.netSalary || 0), 0);
        const teacherCount = records.filter((item) => item.role === 'teacher').length;
        const managerCount = records.filter((item) => item.role === 'manager' || item.role === 'admin').length;
        const exemptCount = records.filter((item) => item.isTaxExempt).length;
        const taxedCount = records.length - exemptCount;
        const totalStudentPaymentsUsed = records.reduce((sum, item) => sum + Number(item.totalStudentPaymentsUsed || 0), 0);
        res.json((0, response_1.createResponse)({
            hijriYear,
            hijriMonth,
            totalGrossSalary: Number(totalGross.toFixed(2)),
            totalTaxAmount: Number(totalTax.toFixed(2)),
            totalNetSalary: Number(totalNet.toFixed(2)),
            teacherCount,
            managerCount,
            exemptCount,
            taxedCount,
            totalStudentPaymentsUsed: Number(totalStudentPaymentsUsed.toFixed(2))
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/settings', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const filter = { isDeleted: false };
        if (req.user?.canonicalRole === 'branch_manager' && req.user?.branchId)
            filter.branchId = req.user.branchId;
        const settings = await SalarySetting_1.SalarySetting.find(filter)
            .populate('userId', 'name role email')
            .populate('branchId', 'name code')
            .lean();
        res.json((0, response_1.createResponse)(settings));
    }
    catch (error) {
        next(error);
    }
});
router.post('/settings', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), (0, validate_1.validate)(settingSchema), async (req, res, next) => {
    try {
        if (req.body.salaryType !== 'fixed' && req.body.percentageScope === 'all_system' && !canEditTaxRules(req)) {
            return res.status(403).json((0, response_1.createError)('تنظیم فیصدی کل سیستم فقط برای سوپر ادمین مجاز است'));
        }
        if (req.body.percentageScope === 'branch' && !req.body.branchId) {
            return res.status(400).json((0, response_1.createError)('نماینده‌گی برای سطح شعبه ضروری است'));
        }
        const payload = {
            ...req.body,
            createdBy: req.user?.userId ?? null,
            updatedBy: req.user?.userId ?? null
        };
        const setting = await SalarySetting_1.SalarySetting.findOneAndUpdate({ userId: req.body.userId, role: req.body.role }, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true });
        res.status(201).json((0, response_1.createResponse)(setting, 'تنظیمات معاش ذخیره شد'));
    }
    catch (error) {
        next(error);
    }
});
router.post('/calculate', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), (0, validate_1.validate)(calculateSchema), async (req, res, next) => {
    try {
        const record = await (0, payrollCalculation_service_1.calculateSalaryRecord)({
            userId: req.body.userId,
            hijriYear: Number(req.body.hijriYear),
            hijriMonth: Number(req.body.hijriMonth),
            actorId: req.user?.userId ?? null,
            allowAllSystemScope: canEditTaxRules(req),
            forceRecalculate: Boolean(req.body.recalculate)
        });
        res.json((0, response_1.createResponse)(record, 'محاسبه معاش موفقانه انجام شد'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(String(error?.message || 'محاسبه معاش ناموفق بود')));
    }
});
router.get('/records', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner', 'teacher']), async (req, res, next) => {
    try {
        const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)();
        const filter = {
            hijriYear: Number(req.query.year || year),
            hijriMonth: Number(req.query.month || month),
            isDeleted: false
        };
        if (req.query.branchId)
            filter.branchId = req.query.branchId;
        if (req.query.role && req.query.role !== 'all')
            filter.role = req.query.role;
        if (req.query.paymentStatus)
            filter.paymentStatus = req.query.paymentStatus;
        if (req.user?.canonicalRole === 'branch_manager' && req.user?.branchId)
            filter.branchId = req.user.branchId;
        if (req.user?.canonicalRole === 'teacher')
            filter.userId = req.user.userId;
        await (0, payrollCalculation_service_1.ensureSalaryRecordsForPeriod)({
            hijriYear: Number(filter.hijriYear),
            hijriMonth: Number(filter.hijriMonth),
            branchId: filter.branchId ? String(filter.branchId) : undefined,
            role: req.query.role ? String(req.query.role) : 'all',
            actorId: req.user?.userId ?? null
        });
        const records = await SalaryRecord_1.SalaryRecord.find(filter)
            .populate('userId', 'name role email')
            .populate('branchId', 'name code')
            .sort({ calculatedAt: -1 })
            .lean();
        res.json((0, response_1.createResponse)(records));
    }
    catch (error) {
        next(error);
    }
});
router.patch('/records/:id/payment-status', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const nextStatus = String(req.body.paymentStatus || '');
        if (!['unpaid', 'paid'].includes(nextStatus)) {
            return res.status(400).json((0, response_1.createError)('وضعیت پرداخت نادرست است'));
        }
        const record = await SalaryRecord_1.SalaryRecord.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { $set: { paymentStatus: nextStatus, paidAt: nextStatus === 'paid' ? new Date() : null } }, { new: true });
        if (!record)
            return res.status(404).json((0, response_1.createError)('رکورد پیدا نشد'));
        res.json((0, response_1.createResponse)(record, 'وضعیت پرداخت ثبت شد'));
    }
    catch (error) {
        next(error);
    }
});
router.patch('/records/:id/tax-status', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const nextStatus = String(req.body.taxStatus || '');
        if (!['pending', 'submitted', 'paid'].includes(nextStatus)) {
            return res.status(400).json((0, response_1.createError)('وضعیت مالیه نادرست است'));
        }
        const record = await SalaryRecord_1.SalaryRecord.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { $set: { taxStatus: nextStatus } }, { new: true });
        if (!record)
            return res.status(404).json((0, response_1.createError)('رکورد پیدا نشد'));
        res.json((0, response_1.createResponse)(record, 'وضعیت مالیه ثبت شد'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/reports/export', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const format = String(req.query.format || 'excel');
        const filter = { isDeleted: false };
        if (req.query.year)
            filter.hijriYear = Number(req.query.year);
        if (req.query.month)
            filter.hijriMonth = Number(req.query.month);
        if (req.query.branchId)
            filter.branchId = req.query.branchId;
        if (req.query.role && req.query.role !== 'all')
            filter.role = req.query.role;
        if (req.query.paymentStatus)
            filter.paymentStatus = req.query.paymentStatus;
        const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)();
        const exportYear = Number(filter.hijriYear || year);
        const exportMonth = Number(filter.hijriMonth || month);
        await (0, payrollCalculation_service_1.ensureSalaryRecordsForPeriod)({
            hijriYear: exportYear,
            hijriMonth: exportMonth,
            branchId: filter.branchId ? String(filter.branchId) : undefined,
            role: req.query.role ? String(req.query.role) : 'all',
            actorId: req.user?.userId ?? null
        });
        const records = await SalaryRecord_1.SalaryRecord.find(filter).populate('userId', 'name role').populate('branchId', 'name').lean();
        if (format === 'pdf') {
            const doc = new pdfkit_1.default({ margin: 30, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="payroll-report.pdf"');
            doc.pipe(res);
            const totalGross = records.reduce((sum, item) => sum + Number(item.grossSalary || 0), 0);
            const totalTax = records.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
            const totalNet = records.reduce((sum, item) => sum + Number(item.netSalary || 0), 0);
            doc.fontSize(16).fillColor('#0f172a').text('گزارش مالیات استادان و کارمندان', { align: 'right' });
            doc.fontSize(10).fillColor('#334155').text(`سال: ${String(req.query.year || '-')} | ماه: ${String(req.query.month || '-')} | شعبه: ${String(req.query.branchId || 'همه')}`, { align: 'right' });
            doc.moveDown(0.8);
            const startX = 30;
            const colName = 120;
            const colRole = 70;
            const colBranch = 80;
            const colGross = 70;
            const colTax = 70;
            const colNet = 70;
            const rowHeight = 24;
            let y = doc.y;
            const drawCell = (x, top, width, height, text, fill, align = 'right', color = '#0f172a') => {
                if (fill) {
                    doc.save().rect(x, top, width, height).fill(fill).restore();
                }
                doc.rect(x, top, width, height).stroke('#334155');
                doc.fillColor(color).fontSize(9).text(text, x + 4, top + 6, { width: width - 8, align });
            };
            drawCell(startX, y, colName, rowHeight, 'نام', '#e2e8f0', 'center');
            drawCell(startX + colName, y, colRole, rowHeight, 'نقش', '#e2e8f0', 'center');
            drawCell(startX + colName + colRole, y, colBranch, rowHeight, 'نماینده‌گی', '#e2e8f0', 'center');
            drawCell(startX + colName + colRole + colBranch, y, colGross, rowHeight, 'ناخالص', '#e2e8f0', 'center');
            drawCell(startX + colName + colRole + colBranch + colGross, y, colTax, rowHeight, 'مالیه', '#e2e8f0', 'center');
            drawCell(startX + colName + colRole + colBranch + colGross + colTax, y, colNet, rowHeight, 'خالص', '#e2e8f0', 'center');
            y += rowHeight;
            records.forEach((item) => {
                const isManager = ['manager', 'admin'].includes(String(item.role || ''));
                const bg = isManager ? '#f8fafc' : '#ffffff';
                drawCell(startX, y, colName, rowHeight, item.userId?.name ?? '-', bg);
                drawCell(startX + colName, y, colRole, rowHeight, String(item.role ?? '-'), bg, 'center');
                drawCell(startX + colName + colRole, y, colBranch, rowHeight, item.branchId?.name ?? '-', bg, 'center');
                drawCell(startX + colName + colRole + colBranch, y, colGross, rowHeight, formatAccounting(Number(item.grossSalary || 0)), bg, 'center');
                drawCell(startX + colName + colRole + colBranch + colGross, y, colTax, rowHeight, formatAccounting(Number(item.taxAmount || 0)), bg, 'center');
                drawCell(startX + colName + colRole + colBranch + colGross + colTax, y, colNet, rowHeight, formatAccounting(Number(item.netSalary || 0)), bg, 'center');
                y += rowHeight;
            });
            y += 8;
            drawCell(startX, y, colName + colRole + colBranch, rowHeight, 'مجموع', '#dbeafe', 'center');
            drawCell(startX + colName + colRole + colBranch, y, colGross, rowHeight, formatAccounting(totalGross), '#dbeafe', 'center');
            drawCell(startX + colName + colRole + colBranch + colGross, y, colTax, rowHeight, formatAccounting(totalTax), '#fef3c7', 'center');
            drawCell(startX + colName + colRole + colBranch + colGross + colTax, y, colNet, rowHeight, formatAccounting(totalNet), '#dcfce7', 'center');
            doc.end();
            return;
        }
        const header = ['نام', 'نقش', 'نماینده‌گی', 'معاش ناخالص', 'کتگوری مالیاتی', 'مقدار مالیه', 'معاش خالص', 'تاریخ محاسبه', 'وضعیت پرداخت', 'توضیح مالیاتی'];
        const rows = records.map((item) => [
            item.userId?.name ?? '',
            item.role ?? '',
            item.branchId?.name ?? '',
            item.grossSalary,
            item.taxCategory,
            item.taxAmount,
            item.netSalary,
            new Date(item.calculatedAt).toISOString(),
            item.paymentStatus,
            item.taxExplanation
        ]);
        const csv = [header, ...rows]
            .map((row) => row.map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="payroll-report.csv"');
        res.send(`\uFEFF${csv}`);
    }
    catch (error) {
        next(error);
    }
});
router.get('/tax-rules', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (_req, res, next) => {
    try {
        await (0, afghanistanSalaryTaxService_1.ensureDefaultTaxRules)();
        const rules = await TaxRule_1.TaxRule.find({ isDeleted: false }).sort({ minAmount: 1 }).lean();
        res.json((0, response_1.createResponse)(rules));
    }
    catch (error) {
        next(error);
    }
});
router.post('/tax-rules', (0, auth_1.authorize)(['super_admin', 'admin']), (0, validate_1.validate)(taxRuleSchema), async (req, res, next) => {
    try {
        if (!canEditTaxRules(req))
            return res.status(403).json((0, response_1.createError)('فقط سوپر ادمین می‌تواند قوانین مالیاتی را تغییر دهد'));
        const rule = await TaxRule_1.TaxRule.create(req.body);
        res.status(201).json((0, response_1.createResponse)(rule, 'قانون مالیاتی اضافه شد'));
    }
    catch (error) {
        next(error);
    }
});
router.patch('/tax-rules/:id', (0, auth_1.authorize)(['super_admin', 'admin']), (0, validate_1.validate)(taxRuleSchema), async (req, res, next) => {
    try {
        if (!canEditTaxRules(req))
            return res.status(403).json((0, response_1.createError)('فقط سوپر ادمین می‌تواند قوانین مالیاتی را تغییر دهد'));
        const rule = await TaxRule_1.TaxRule.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { $set: req.body }, { new: true });
        if (!rule)
            return res.status(404).json((0, response_1.createError)('قانون مالیاتی پیدا نشد'));
        res.json((0, response_1.createResponse)(rule, 'قانون مالیاتی به‌روزرسانی شد'));
    }
    catch (error) {
        next(error);
    }
});
router.post('/tax-calculator', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner', 'teacher']), async (req, res, next) => {
    try {
        const grossSalary = Number(req.body?.grossSalary ?? 0);
        if (grossSalary < 0)
            return res.status(400).json((0, response_1.createError)('معاش نمی‌تواند منفی باشد'));
        const result = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(grossSalary);
        res.json((0, response_1.createResponse)(result));
    }
    catch (error) {
        next(error);
    }
});
router.get('/meta', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (_req, res, next) => {
    try {
        const [users, branches] = await Promise.all([
            User_1.User.find({ isDeleted: false, role: { $in: ['teacher', 'admin', 'branch_manager'] } }).select('name role branchId').lean(),
            Branch_1.Branch.find({ isDeleted: false }).select('name code').lean()
        ]);
        res.json((0, response_1.createResponse)({
            users: users.map((user) => ({ value: String(user._id), label: user.name, role: user.role, branchId: user.branchId ? String(user.branchId) : null })),
            branches: branches.map((branch) => ({ value: String(branch._id), label: branch.name || branch.code }))
        }));
    }
    catch (error) {
        next(error);
    }
});
exports.payrollRouter = router;
