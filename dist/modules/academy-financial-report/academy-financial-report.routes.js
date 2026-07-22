"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.academyFinancialReportRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Student_1 = require("../../models/Student");
const Payment_1 = require("../../models/Payment");
const Expense_1 = require("../../models/Expense");
const Branch_1 = require("../../models/Branch");
const TaxPercentageSetting_1 = require("../../models/TaxPercentageSetting");
const afghanistanSalaryTaxService_1 = require("../../services/afghanistanSalaryTaxService");
const router = (0, express_1.Router)();
function formatAccounting(value) {
    const amount = Number(value || 0);
    const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amount < 0 ? `(${abs})` : abs;
}
function buildDocumentNumber(filters) {
    const type = filters.reportType === 'monthly' ? 'M' : filters.reportType === 'quarterly' ? 'Q' : 'Y';
    const period = filters.reportType === 'monthly'
        ? `${filters.hijriYear}-${String(filters.hijriMonth || 0).padStart(2, '0')}`
        : filters.reportType === 'quarterly'
            ? `${filters.hijriYear}-Q${filters.quarter || 0}`
            : `${filters.hijriYear}`;
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `AFR-${type}-${period}-${random}`;
}
function resolveAcademyLogoPath() {
    const publicDir = node_path_1.default.resolve(process.cwd(), '../frontend/public');
    const candidates = ['academy-logo.png', 'academy-logo.jpg', 'academy-logo.jpeg'];
    for (const fileName of candidates) {
        const fullPath = node_path_1.default.join(publicDir, fileName);
        if (node_fs_1.default.existsSync(fullPath)) {
            return fullPath;
        }
    }
    return null;
}
const querySchema = joi_1.default.object({
    query: joi_1.default.object({
        reportType: joi_1.default.string().valid('monthly', 'quarterly', 'yearly').required(),
        hijriYear: joi_1.default.number().required(),
        hijriMonth: joi_1.default.number().min(1).max(12).optional(),
        quarter: joi_1.default.number().min(1).max(4).optional(),
        branchId: joi_1.default.string().hex().length(24).optional(),
        paymentStatus: joi_1.default.string().valid('all', 'paid', 'due').optional(),
        format: joi_1.default.string().valid('excel', 'pdf').optional()
    })
});
function quarterMonths(quarter) {
    if (quarter === 1)
        return [1, 2, 3];
    if (quarter === 2)
        return [4, 5, 6];
    if (quarter === 3)
        return [7, 8, 9];
    return [10, 11, 12];
}
function includeByPeriod(reportType, year, month, targetMonth, quarter) {
    if (reportType === 'yearly')
        return year === Number(year);
    if (reportType === 'monthly')
        return year === Number(year) && month === Number(targetMonth);
    const months = quarterMonths(Number(quarter || 1));
    return year === Number(year) && months.includes(month);
}
function normalizeCategory(input) {
    return String(input || '').trim().toLowerCase();
}
async function getActiveTaxSetting(branchId) {
    const now = new Date();
    const baseFilter = {
        isDeleted: false,
        isActive: true,
        effectiveFrom: { $lte: now },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    };
    const branchFilter = branchId ? { ...baseFilter, branchId } : { ...baseFilter, branchId: null };
    let setting = await TaxPercentageSetting_1.TaxPercentageSetting.findOne(branchFilter).sort({ effectiveFrom: -1 }).lean();
    if (!setting && branchId) {
        setting = await TaxPercentageSetting_1.TaxPercentageSetting.findOne({ ...baseFilter, branchId: null }).sort({ effectiveFrom: -1 }).lean();
    }
    return setting;
}
async function buildReport(query, user) {
    const reportType = String(query.reportType);
    const hijriYear = Number(query.hijriYear);
    const hijriMonth = query.hijriMonth ? Number(query.hijriMonth) : undefined;
    const quarter = query.quarter ? Number(query.quarter) : undefined;
    const paymentStatus = String(query.paymentStatus || 'all');
    const branchId = user?.canonicalRole === 'admin' || user?.canonicalRole === 'branch_manager'
        ? (user?.branchId ?? null)
        : (query.branchId ? String(query.branchId) : null);
    const [students, payments, expenses, branch, taxSetting] = await Promise.all([
        Student_1.Student.find({ isDeleted: false, status: 'active', ...(branchId ? { branchId } : {}) }).select('_id branchId registrationDate').lean(),
        Payment_1.Payment.find({
            isDeleted: false,
            ...(branchId ? { branchId } : {}),
            ...(paymentStatus === 'paid' ? { status: { $in: ['paid', 'completed'] } } : paymentStatus === 'due' ? { status: { $in: ['pending'] } } : { status: { $nin: ['cancelled', 'refunded'] } })
        }).select('studentId amount paymentDate status').lean(),
        Expense_1.Expense.find({ isDeleted: false, category: { $ne: 'income' }, ...(branchId ? { branchId } : {}) }).select('amount date category title').lean(),
        branchId ? Branch_1.Branch.findById(branchId).select('name code').lean() : Promise.resolve(null),
        getActiveTaxSetting(branchId ?? undefined)
    ]);
    const filteredStudents = students.filter((student) => {
        const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)(student.registrationDate);
        if (reportType === 'yearly')
            return year === hijriYear;
        if (reportType === 'monthly')
            return year === hijriYear && month === hijriMonth;
        return year === hijriYear && quarterMonths(Number(quarter || 1)).includes(month);
    });
    const filteredPayments = payments.filter((payment) => {
        const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)(payment.paymentDate);
        if (reportType === 'yearly')
            return year === hijriYear;
        if (reportType === 'monthly')
            return year === hijriYear && month === hijriMonth;
        return year === hijriYear && quarterMonths(Number(quarter || 1)).includes(month);
    });
    const filteredExpenses = expenses.filter((expense) => {
        const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)(expense.date);
        if (reportType === 'yearly')
            return year === hijriYear;
        if (reportType === 'monthly')
            return year === hijriYear && month === hijriMonth;
        return year === hijriYear && quarterMonths(Number(quarter || 1)).includes(month);
    });
    const totalStudents = students.length;
    const activeStudentsCount = filteredStudents.length;
    const payingStudentSet = new Set(filteredPayments.map((payment) => String(payment.studentId)));
    const payingStudentsCount = payingStudentSet.size;
    const totalRevenue = filteredPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const quarterlyRate = Number(taxSetting?.quarterlyRate ?? 0);
    const annualRate = Number(taxSetting?.annualRate ?? 0);
    const monthQuarterTaxEnabled = Boolean(taxSetting?.monthlyQuarterlyEnabled);
    const annualShareEnabled = Boolean(taxSetting?.showAnnualEstimatedShare);
    const quarterlyTax = reportType === 'quarterly' || (reportType === 'monthly' && monthQuarterTaxEnabled)
        ? (totalRevenue * quarterlyRate) / 100
        : 0;
    const annualTax = reportType === 'yearly' || ((reportType === 'monthly' || reportType === 'quarterly') && annualShareEnabled)
        ? (totalRevenue * annualRate) / 100
        : 0;
    const rentAmount = filteredExpenses
        .filter((item) => normalizeCategory(item.category) === 'کرایه' || normalizeCategory(item.title) === 'کرایه')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const electricityAmount = filteredExpenses
        .filter((item) => normalizeCategory(item.category) === 'بل برق' || normalizeCategory(item.title) === 'بل برق')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const otherExpenses = filteredExpenses
        .filter((item) => {
        const category = normalizeCategory(item.category);
        const title = normalizeCategory(item.title);
        return category !== 'کرایه' && category !== 'بل برق' && title !== 'کرایه' && title !== 'بل برق';
    })
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalExpenses = rentAmount + electricityAmount + otherExpenses;
    const totalSmallTaxes = quarterlyTax + annualTax;
    const totalDeductions = totalSmallTaxes + totalExpenses;
    const netProfit = totalRevenue - totalDeductions;
    const explanations = [
        `فیصدی مالیات ربع‌وار استفاده‌شده: ${quarterlyRate}٪`,
        `فیصدی مالیات سالانه استفاده‌شده: ${annualRate}٪`,
        `نوع گزارش: ${reportType}`,
        'کرایه و بل برق از بخش مصارفات گرفته شده',
        'تعداد شاگردان از بخش شاگردان گرفته شده',
        'عواید از پرداخت‌های تاییدشده گرفته شده',
        'هیچ مقدار مالی به شکل دستی در این گزارش وارد نمی‌شود',
        !taxSetting ? 'فیصدی مالیات فعال پیدا نشد. لطفاً از تنظیمات فیصدی مالیات آن را فعال کنید.' : ''
    ].filter(Boolean);
    const tableRows = [
        { key: 'active_students', label: 'تعداد کل شاگردان فعال', value: activeStudentsCount, source: 'students' },
        { key: 'paying_students', label: 'تعداد شاگردان پرداخت‌کننده', value: payingStudentsCount, source: 'payments' },
        { key: 'total_revenue', label: 'مجموع عواید شاگردان', value: totalRevenue, source: 'payments' },
        { key: 'quarterly_rate', label: 'فیصدی مالیات ربع‌وار', value: quarterlyRate, source: 'tax_percentage' },
        { key: 'quarterly_tax', label: 'مقدار مالیات ربع‌وار', value: quarterlyTax, source: 'payments+tax' },
        { key: 'annual_rate', label: 'فیصدی مالیات سالانه', value: annualRate, source: 'tax_percentage' },
        { key: 'annual_tax', label: 'مقدار مالیات سالانه', value: annualTax, source: 'payments+tax' },
        { key: 'rent', label: 'کرایه', value: rentAmount, source: 'expenses' },
        { key: 'electricity', label: 'بل برق', value: electricityAmount, source: 'expenses' },
        { key: 'other_expenses', label: 'سایر مصارفات', value: otherExpenses, source: 'expenses' },
        { key: 'total_expenses', label: 'مجموع مصارفات', value: totalExpenses, source: 'calculated' },
        { key: 'small_taxes', label: 'مجموع مالیات کوچک', value: totalSmallTaxes, source: 'calculated' },
        { key: 'total_deductions', label: 'مجموع کسرات', value: totalDeductions, source: 'calculated' },
        { key: 'net_profit', label: 'مفاد خالص اکادمی', value: netProfit, source: 'calculated' }
    ];
    return {
        filters: { reportType, hijriYear, hijriMonth: hijriMonth ?? null, quarter: quarter ?? null, branchId, paymentStatus },
        period: { reportType, hijriYear, hijriMonth: hijriMonth ?? null, quarter: quarter ?? null },
        branch: branch ? { id: String(branch._id), name: branch.name ?? branch.code ?? '' } : null,
        studentCounts: {
            totalActiveStudents: activeStudentsCount,
            totalStudentsAllScope: totalStudents,
            payingStudents: payingStudentsCount
        },
        revenue: { totalConfirmedStudentPayments: totalRevenue },
        taxRates: {
            quarterlyRate,
            annualRate,
            monthlyQuarterlyEnabled: monthQuarterTaxEnabled,
            showAnnualEstimatedShare: annualShareEnabled
        },
        taxAmounts: {
            quarterlyTax,
            annualTax,
            warning: taxSetting ? '' : 'فیصدی مالیات فعال پیدا نشد. لطفاً از تنظیمات فیصدی مالیات آن را فعال کنید.'
        },
        expenses: {
            rent: rentAmount,
            electricity: electricityAmount,
            otherExpenses,
            totalExpenses
        },
        deductions: {
            totalSmallTaxes,
            totalDeductions
        },
        netProfit,
        explanations,
        tableRows,
        totalsFooter: {
            totalRevenue,
            totalTaxes: totalSmallTaxes,
            totalExpenses,
            netProfit
        }
    };
}
router.get('/', (0, validate_1.validate)(querySchema), auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const report = await buildReport(req.query, req.user);
        res.json((0, response_1.createResponse)(report));
    }
    catch (error) {
        next(error);
    }
});
router.get('/export', (0, validate_1.validate)(querySchema), auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const format = String(req.query.format || 'excel');
        const report = await buildReport(req.query, req.user);
        if (format === 'pdf') {
            const doc = new pdfkit_1.default({ margin: 30, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="academy-financial-report.pdf"');
            doc.pipe(res);
            const documentNo = buildDocumentNumber(report.filters);
            const printedAt = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date());
            // Draw academy logo mark (real logo if available)
            const logoX = 35;
            const logoY = 28;
            const logoPath = resolveAcademyLogoPath();
            if (logoPath) {
                doc.image(logoPath, logoX, logoY, { fit: [32, 32], align: 'center', valign: 'center' });
            }
            else {
                doc.save();
                doc.circle(logoX + 16, logoY + 14, 14).fill('#0ea5e9');
                doc.fillColor('#ffffff').fontSize(14).text('N', logoX + 11, logoY + 7);
                doc.restore();
            }
            doc.fontSize(16).fillColor('#0f172a').text('ورق گزارش مالی اکادمی', 70, 28, { align: 'right' });
            doc.fontSize(10).fillColor('#334155').text(`نوع گزارش: ${report.filters.reportType} | سال: ${report.filters.hijriYear}` +
                `${report.filters.hijriMonth ? ` | ماه: ${report.filters.hijriMonth}` : ''}` +
                `${report.filters.quarter ? ` | ربع: ${report.filters.quarter}` : ''}`, 70, 48, { align: 'right' });
            doc.fontSize(9).fillColor('#475569').text(`شماره سند: ${documentNo}`, 70, 62, { align: 'right' });
            doc.fontSize(9).fillColor('#475569').text(`تاریخ چاپ: ${printedAt}`, 70, 74, { align: 'right' });
            doc.moveDown(1.2);
            const startX = 35;
            const colTitle = 270;
            const colValue = 150;
            const colSource = 120;
            let y = doc.y;
            const drawCell = (x, top, width, height, text, fill, align = 'right', color = '#0f172a') => {
                if (fill) {
                    doc.save().rect(x, top, width, height).fill(fill).restore();
                }
                doc.rect(x, top, width, height).stroke('#334155');
                doc.fillColor(color).fontSize(9).text(text, x + 6, top + 6, {
                    width: width - 12,
                    align
                });
            };
            const rowHeight = 26;
            drawCell(startX, y, colTitle, rowHeight, 'عنوان', '#e2e8f0', 'center');
            drawCell(startX + colTitle, y, colValue, rowHeight, 'مقدار', '#e2e8f0', 'center');
            drawCell(startX + colTitle + colValue, y, colSource, rowHeight, 'منبع', '#e2e8f0', 'center');
            y += rowHeight;
            report.tableRows.forEach((row) => {
                let bg = '';
                if (row.key === 'net_profit')
                    bg = '#dcfce7';
                if (row.key === 'total_deductions' || row.key === 'total_expenses' || row.key === 'small_taxes')
                    bg = '#fee2e2';
                if (row.key === 'total_revenue')
                    bg = '#e0f2fe';
                const isNegative = Number(row.value || 0) < 0;
                drawCell(startX, y, colTitle, rowHeight, row.label, bg);
                drawCell(startX + colTitle, y, colValue, rowHeight, formatAccounting(Number(row.value || 0)), bg, 'center', isNegative ? '#b91c1c' : '#0f172a');
                drawCell(startX + colTitle + colValue, y, colSource, rowHeight, row.source, bg, 'center');
                y += rowHeight;
            });
            y += 12;
            const drawTotalRow = (label, value, color) => {
                drawCell(startX, y, colTitle, rowHeight, label, color);
                drawCell(startX + colTitle, y, colValue, rowHeight, formatAccounting(value), color, 'center', value < 0 ? '#b91c1c' : '#0f172a');
                drawCell(startX + colTitle + colValue, y, colSource, rowHeight, '', color, 'center');
                y += rowHeight;
            };
            drawTotalRow('مجموع عواید', report.totalsFooter.totalRevenue, '#dbeafe');
            drawTotalRow('مجموع مالیات', report.totalsFooter.totalTaxes, '#fef3c7');
            drawTotalRow('مجموع مصارفات', report.totalsFooter.totalExpenses, '#fee2e2');
            drawTotalRow('مفاد خالص', report.totalsFooter.netProfit, '#dcfce7');
            y += 14;
            doc.fontSize(11).fillColor('#0f172a').text('توضیحات محاسبات', startX, y, { align: 'right', width: colTitle + colValue + colSource });
            y += 18;
            report.explanations.forEach((text) => {
                doc.fontSize(9).fillColor('#334155').text(`- ${text}`, startX, y, { align: 'right', width: colTitle + colValue + colSource });
                y += 16;
            });
            // Footer (fixed style)
            const footerY = doc.page.height - 32;
            doc.moveTo(35, footerY - 6).lineTo(doc.page.width - 35, footerY - 6).stroke('#cbd5e1');
            doc.fontSize(8).fillColor('#475569').text('Nokta Academy • Financial Worksheet • Confidential', 35, footerY, {
                width: doc.page.width - 70,
                align: 'center'
            });
            doc.end();
            return;
        }
        const rows = report.tableRows.map((row) => [row.label, row.value, row.source]);
        const csv = [['عنوان', 'مقدار', 'منبع'], ...rows]
            .map((row) => row.map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="academy-financial-report.csv"');
        res.send(`\uFEFF${csv}`);
    }
    catch (error) {
        next(error);
    }
});
exports.academyFinancialReportRouter = router;
