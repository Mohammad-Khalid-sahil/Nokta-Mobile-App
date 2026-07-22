"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayrollFilters = getPayrollFilters;
exports.buildEmployeeTaxReport = buildEmployeeTaxReport;
const SalaryRecord_1 = require("../models/SalaryRecord");
const SalarySetting_1 = require("../models/SalarySetting");
const User_1 = require("../models/User");
const afghanistanSalaryTaxService_1 = require("./afghanistanSalaryTaxService");
const payrollCalculation_service_1 = require("./payrollCalculation.service");
function canEditTaxRules(req) {
    return req.user?.canonicalRole === 'super_admin' || req.user?.role === 'super_admin';
}
function getPayrollFilters(req) {
    const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)();
    const hijriYear = Number(req.query.hijriYear || req.query.year || year);
    const hijriMonthRaw = req.query.hijriMonth || req.query.month;
    const quarterRaw = req.query.quarter;
    const quarter = quarterRaw ? Number(quarterRaw) : undefined;
    const hijriMonth = hijriMonthRaw ? Number(hijriMonthRaw) : undefined;
    const months = hijriMonth && hijriMonth >= 1 && hijriMonth <= 12
        ? [hijriMonth]
        : quarter && quarter >= 1 && quarter <= 4
            ? [quarter * 3 - 2, quarter * 3 - 1, quarter * 3]
            : [month];
    const role = String(req.query.role || 'all');
    const branchId = req.user && req.user?.canonicalRole === 'branch_manager' && req.user?.branchId
        ? String(req.user.branchId)
        : req.query.branchId
            ? String(req.query.branchId)
            : '';
    return {
        hijriYear,
        hijriMonth: months[0],
        quarter: quarter ?? Math.ceil(months[0] / 3),
        months,
        role,
        branchId,
        paymentStatus: req.query.paymentStatus ? String(req.query.paymentStatus) : '',
        taxStatus: req.query.taxStatus ? String(req.query.taxStatus) : ''
    };
}
function normalizeEmployeeRole(role) {
    return role === 'teacher' ? 'teacher' : 'manager';
}
function employeeRoleFilter(role) {
    if (role === 'teacher')
        return 'teacher';
    if (role === 'manager' || role === 'admin') {
        return { $in: ['admin', 'branch_manager', 'owner'] };
    }
    return { $in: ['teacher', 'admin', 'branch_manager', 'owner'] };
}
async function getActivePayrollEmployees(args) {
    const filter = {
        isDeleted: false,
        active: { $ne: false },
        status: { $nin: ['inactive', 'blocked', 'expired'] },
        role: employeeRoleFilter(args.role)
    };
    if (args.branchId)
        filter.branchId = args.branchId;
    return User_1.User.find(filter)
        .select('name role email branchId salaryType fixedSalary percentageRate customPercentage')
        .populate('branchId', 'name code')
        .sort({ role: 1, name: 1 })
        .lean();
}
function getFallbackSalarySetting(employee) {
    const fixedAmount = Number(employee?.fixedSalary || 0);
    const percentage = Number(employee?.customPercentage || employee?.percentageRate || 0);
    const salaryType = String(employee?.salaryType || 'fixed');
    const hasFixed = fixedAmount > 0;
    const hasPercentage = percentage > 0 && salaryType !== 'fixed';
    if (!hasFixed && !hasPercentage)
        return null;
    const isTeacher = employee.role === 'teacher';
    return {
        userId: employee._id,
        role: normalizeEmployeeRole(employee.role),
        branchId: employee.branchId?._id ?? employee.branchId ?? null,
        salaryType: ['fixed', 'percentage', 'fixed_plus_percentage'].includes(salaryType) ? salaryType : 'fixed',
        fixedAmount,
        percentage,
        percentageScope: isTeacher ? 'branch' : 'branch',
        isActive: true,
        source: 'user_profile'
    };
}
function normalizeTaxRecord(record, employee) {
    const branch = record?.branchId && typeof record.branchId === 'object'
        ? record.branchId
        : employee?.branchId && typeof employee.branchId === 'object'
            ? employee.branchId
            : null;
    return {
        _id: record?._id ? String(record._id) : `${String(employee?._id)}-missing-setting`,
        employeeId: String(employee?._id || record?.userId?._id || record?.userId || ''),
        userId: employee?._id ? { _id: employee._id, name: employee.name, role: employee.role } : record?.userId,
        name: employee?.name || record?.userId?.name || '',
        role: normalizeEmployeeRole(employee?.role || record?.role || ''),
        branch,
        branchId: branch,
        grossSalary: Number(record?.grossSalary || 0),
        fixedAmount: Number(record?.fixedAmount || 0),
        commissionAmount: Number(record?.commissionAmount || 0),
        totalStudentPaymentsUsed: Number(record?.totalStudentPaymentsUsed || 0),
        percentageUsed: Number(record?.percentageUsed || 0),
        salaryType: record?.salaryType || '',
        taxAmount: Number(record?.taxAmount || 0),
        netSalary: Number(record?.netSalary || 0),
        taxCategory: record?.taxCategory || '',
        taxFormula: record?.taxFormula || '',
        taxExplanation: record?.taxExplanation || '',
        isTaxExempt: Boolean(record?.isTaxExempt),
        calculatedAt: record?.calculatedAt || null,
        paymentStatus: record?.paymentStatus || '',
        taxStatus: record?.taxStatus || '',
        warning: record?.warning || '',
        settingMissing: Boolean(record?.settingMissing)
    };
}
async function buildEmployeeTaxReport(req, forceRecalculate = false) {
    const filters = getPayrollFilters(req);
    const employees = await getActivePayrollEmployees({
        role: filters.role,
        branchId: filters.branchId || undefined
    });
    const employeeIds = employees.map((employee) => employee._id);
    const settings = await SalarySetting_1.SalarySetting.find({
        isDeleted: false,
        isActive: true,
        userId: { $in: employeeIds },
        ...(filters.branchId ? { $or: [{ branchId: filters.branchId }, { branchId: null }] } : {})
    }).sort({ updatedAt: -1 }).lean();
    const settingByUserId = new Map(settings.map((setting) => [String(setting.userId), setting]));
    const records = [];
    for (const employee of employees) {
        const setting = settingByUserId.get(String(employee._id)) ?? getFallbackSalarySetting(employee);
        const hasRealSalarySource = setting && (Number(setting.fixedAmount || 0) > 0
            || (setting.salaryType !== 'fixed' && Number(setting.percentage || 0) > 0));
        if (!setting) {
            const existingRecords = await SalaryRecord_1.SalaryRecord.find({
                userId: employee._id,
                hijriYear: filters.hijriYear,
                hijriMonth: { $in: filters.months },
                isDeleted: false,
                ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
                ...(filters.taxStatus ? { taxStatus: filters.taxStatus } : {})
            }).sort({ hijriMonth: 1 }).lean();
            if (existingRecords.length) {
                const first = existingRecords[0];
                records.push(normalizeTaxRecord({
                    ...first,
                    salaryType: first.salaryType,
                    _id: existingRecords.length === 1 ? first._id : `${String(employee._id)}-${filters.hijriYear}-existing`,
                    grossSalary: existingRecords.reduce((sum, item) => sum + Number(item.grossSalary || 0), 0),
                    taxAmount: existingRecords.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0),
                    netSalary: existingRecords.reduce((sum, item) => sum + Number(item.netSalary || 0), 0),
                    fixedAmount: existingRecords.reduce((sum, item) => sum + Number(item.fixedAmount || 0), 0),
                    commissionAmount: existingRecords.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0)
                }, employee));
            }
            else if (!filters.paymentStatus && !filters.taxStatus) {
                const roleLabel = normalizeEmployeeRole(employee.role) === 'teacher' ? 'استاد' : 'مدیر';
                records.push(normalizeTaxRecord({
                    warning: `تنظیمات معاش برای این ${roleLabel} ثبت نشده است.`,
                    taxExplanation: `تنظیمات معاش برای این ${roleLabel} ثبت نشده است.`,
                    settingMissing: true
                }, employee));
            }
            continue;
        }
        if (!hasRealSalarySource) {
            const roleLabel = normalizeEmployeeRole(employee.role) === 'teacher' ? 'استاد' : 'مدیر';
            if (!filters.paymentStatus && !filters.taxStatus) {
                records.push(normalizeTaxRecord({
                    warning: `مقدار معاش برای این ${roleLabel} ثبت نشده است.`,
                    taxExplanation: `برای محاسبه مالیه، اول مقدار معاش این ${roleLabel} را در تنظیمات معاش ثبت کنید.`,
                    settingMissing: true
                }, employee));
            }
            continue;
        }
        const monthlyRecords = [];
        for (const month of filters.months) {
            const record = await (0, payrollCalculation_service_1.calculateSalaryRecord)({
                userId: String(employee._id),
                hijriYear: filters.hijriYear,
                hijriMonth: month,
                actorId: req.user?.userId ?? null,
                allowAllSystemScope: canEditTaxRules(req),
                forceRecalculate,
                settingOverride: setting
            });
            monthlyRecords.push(record);
        }
        const filteredMonthlyRecords = monthlyRecords.filter((record) => {
            if (filters.paymentStatus && record.paymentStatus !== filters.paymentStatus)
                return false;
            if (filters.taxStatus && record.taxStatus !== filters.taxStatus)
                return false;
            return true;
        });
        if (!filteredMonthlyRecords.length)
            continue;
        const first = filteredMonthlyRecords[0];
        records.push(normalizeTaxRecord({
            ...first,
            salaryType: setting.salaryType,
            _id: filteredMonthlyRecords.length === 1 ? first._id : `${String(employee._id)}-${filters.hijriYear}-q${filters.quarter}`,
            grossSalary: filteredMonthlyRecords.reduce((sum, item) => sum + Number(item.grossSalary || 0), 0),
            taxAmount: filteredMonthlyRecords.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0),
            netSalary: filteredMonthlyRecords.reduce((sum, item) => sum + Number(item.netSalary || 0), 0),
            fixedAmount: filteredMonthlyRecords.reduce((sum, item) => sum + Number(item.fixedAmount || 0), 0),
            commissionAmount: filteredMonthlyRecords.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0),
            totalStudentPaymentsUsed: filteredMonthlyRecords.reduce((sum, item) => sum + Number(item.totalStudentPaymentsUsed || 0), 0),
            taxCategory: filteredMonthlyRecords.length === 1 ? first.taxCategory : 'محاسبه چند ماهه',
            taxFormula: filteredMonthlyRecords.length === 1 ? first.taxFormula : 'جمع مالیه ماه‌های انتخاب‌شده',
            taxExplanation: filteredMonthlyRecords.length === 1
                ? first.taxExplanation
                : 'مالیه برای هر ماه جداگانه محاسبه و سپس جمع شده است.'
        }, employee));
    }
    const countedRecords = records.filter((record) => !record.settingMissing);
    return {
        summary: {
            totalGrossSalary: Number(countedRecords.reduce((sum, item) => sum + Number(item.grossSalary || 0), 0).toFixed(2)),
            totalTaxAmount: Number(countedRecords.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0).toFixed(2)),
            totalNetSalary: Number(countedRecords.reduce((sum, item) => sum + Number(item.netSalary || 0), 0).toFixed(2)),
            totalTeachers: countedRecords.filter((item) => item.role === 'teacher').length,
            totalManagers: countedRecords.filter((item) => item.role === 'manager').length
        },
        records,
        filters,
        explanations: records.length ? [] : ['برای این فلتر هیچ معلوماتی پیدا نشد.']
    };
}
