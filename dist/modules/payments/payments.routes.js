"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const pagination_1 = require("../../validators/pagination");
const Expense_1 = require("../../models/Expense");
const Payment_1 = require("../../models/Payment");
const SalaryRecord_1 = require("../../models/SalaryRecord");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const Enrollment_1 = require("../../models/Enrollment");
const teacherCompensationService_1 = require("../../services/teacherCompensationService");
const afghanistanSalaryTaxService_1 = require("../../services/afghanistanSalaryTaxService");
const studentDisplay_1 = require("../../utils/studentDisplay");
const router = (0, express_1.Router)();
function serializePayment(payment) {
    const display = payment?.studentId?.studentDisplay ?? {};
    return {
        ...payment,
        studentName: display.fullName ?? [payment?.studentId?.firstName, payment?.studentId?.lastName].filter(Boolean).join(' ').trim(),
        studentRollNo: display.studentNumber ?? payment?.studentId?.rollNo ?? payment?.studentId?.studentId ?? '',
        className: display.className ?? '',
        subjectName: display.subjectName ?? '',
        teacherName: display.teacherName ?? '',
        guardianPhone: display.guardianPhone ?? payment?.studentId?.familyPhone ?? '',
        studentPhone: display.studentPhone ?? '',
        branchName: display.branchName ?? '',
        enrollmentStatus: display.enrollmentStatus ?? '',
        studentDisplay: display,
        paymentFor: payment?.paymentFor ?? 'student_fee',
        payeeName: payment?.payeeUserId?.name ?? '',
        payeeRole: payment?.payeeRole ?? '',
        grossAmount: Number(payment?.grossAmount ?? payment?.amount ?? 0),
        taxAmount: Number(payment?.taxAmount ?? 0),
        netAmount: Number(payment?.netAmount ?? payment?.amount ?? 0),
        invoiceNumber: payment?.invoiceNumber ?? '',
        remainingBalance: Number(payment?.studentId?.remainingBalance ?? 0),
        remainingSalaryBalance: Number(payment?.remainingSalaryBalance ?? 0)
    };
}
async function normalizePayment(payment) {
    if (!payment?.studentId)
        return serializePayment(payment);
    const student = await (0, studentDisplay_1.enrichStudentWithDisplay)(payment.studentId);
    return serializePayment({ ...payment, studentId: student });
}
async function normalizePayments(payments) {
    return Promise.all(payments.map(normalizePayment));
}
const paymentSchema = joi_1.default.object({
    body: joi_1.default.object({
        paymentType: joi_1.default.string().valid('student_fee', 'employee_salary').optional(),
        paymentFor: joi_1.default.string().valid('student_fee', 'teacher_salary', 'manager_salary').optional(),
        studentId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        classId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        employeeId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        payeeUserId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        employeeRole: joi_1.default.string().valid('teacher', 'manager').allow('', null).optional(),
        payeeRole: joi_1.default.string().valid('teacher', 'manager').allow('', null).optional(),
        amount: joi_1.default.number().positive().required(),
        grossSalary: joi_1.default.number().min(0).optional(),
        salaryMonth: joi_1.default.number().min(1).max(12).optional(),
        salaryYear: joi_1.default.number().min(1300).max(1500).optional(),
        discount: joi_1.default.number().min(0).optional(),
        method: joi_1.default.string().valid('cash', 'bank_transfer', 'mobile_money', 'card').optional(),
        paymentDate: joi_1.default.date().iso().optional(),
        referenceNumber: joi_1.default.string().allow('', null).optional(),
        notes: joi_1.default.string().allow('', null).optional(),
        branchId: joi_1.default.string().hex().length(24).optional()
    })
});
router.use(auth_1.authenticate);
async function getScopedPaymentStudentIds(req) {
    const role = req.user?.canonicalRole;
    if (!role || !req.user?.userId) {
        return null;
    }
    if (role === 'student') {
        const user = await User_1.User.findById(req.user.userId).select('studentId').lean();
        if (!user?.studentId) {
            return [];
        }
        const student = await Student_1.Student.findOne({ studentId: user.studentId, isDeleted: false }).select('_id').lean();
        return student ? [student._id] : [];
    }
    if (role === 'parent') {
        const user = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
        const filter = { isDeleted: false };
        if (user?.familyId) {
            filter.familyId = user.familyId;
        }
        else if (user?.parentProfileId) {
            filter.parentProfileId = user.parentProfileId;
        }
        else {
            return [];
        }
        const students = await Student_1.Student.find(filter).select('_id').lean();
        return students.map((student) => student._id);
    }
    return null;
}
function buildPaymentReference() {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const entropy = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    return `PAY-${stamp}-${entropy}`;
}
function buildInvoiceNumber() {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const entropy = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    return `INV-${stamp}-${entropy}`;
}
async function generateInvoiceNumber() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = buildInvoiceNumber();
        const exists = await Payment_1.Payment.findOne({ invoiceNumber: candidate }).select('_id').lean();
        if (!exists)
            return candidate;
    }
    throw new Error('Unable to generate invoice number');
}
async function resolvePaymentReference(rawReference) {
    const trimmedReference = String(rawReference ?? '').trim();
    if (trimmedReference) {
        const duplicate = await Payment_1.Payment.findOne({ referenceNumber: trimmedReference, isDeleted: false }).select('_id').lean();
        if (duplicate) {
            return { error: 'Duplicate payment reference. Use a unique reference number.' };
        }
        return { referenceNumber: trimmedReference };
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const generated = buildPaymentReference();
        const exists = await Payment_1.Payment.findOne({ referenceNumber: generated, isDeleted: false }).select('_id').lean();
        if (!exists) {
            return { referenceNumber: generated };
        }
    }
    return { error: 'Unable to generate a unique payment reference. Please try again.' };
}
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner', 'student', 'parent']), (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const filter = { isDeleted: false };
        if (req.query.studentId) {
            filter.studentId = req.query.studentId;
        }
        const scopedStudentIds = await getScopedPaymentStudentIds(req);
        if (Array.isArray(scopedStudentIds)) {
            filter.studentId = { $in: scopedStudentIds };
        }
        const [payments, total] = await Promise.all([
            Payment_1.Payment.find(filter)
                .populate({ path: 'studentId', populate: studentDisplay_1.studentPopulatePaths, select: 'firstName lastName studentId rollNo remainingBalance classId subjectId teacherId branchId familyId parentProfileId familyPhone whatsapp status accountStatus' })
                .populate('payeeUserId', 'name email role')
                .lean()
                .sort({ paymentDate: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Payment_1.Payment.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(await normalizePayments(payments), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'student']), (0, validate_1.validate)(paymentSchema), async (req, res, next) => {
    try {
        const isStudentSelfPayment = req.user?.canonicalRole === 'student';
        let selectedPaymentClassId = null;
        const requestedPaymentType = String(req.body.paymentType || '');
        const requestedRole = String(req.body.employeeRole || req.body.payeeRole || '');
        let paymentFor = String(req.body.paymentFor || 'student_fee');
        if (requestedPaymentType === 'student_fee')
            paymentFor = 'student_fee';
        if (requestedPaymentType === 'employee_salary') {
            paymentFor = requestedRole === 'manager' ? 'manager_salary' : 'teacher_salary';
        }
        const isStudentPayment = paymentFor === 'student_fee';
        const isSalaryPayment = paymentFor === 'teacher_salary' || paymentFor === 'manager_salary';
        const payeeUserId = req.body.employeeId || req.body.payeeUserId;
        const payeeRole = requestedRole || (paymentFor === 'teacher_salary' ? 'teacher' : paymentFor === 'manager_salary' ? 'manager' : null);
        let selfStudent = null;
        if (isStudentSelfPayment) {
            if (!isStudentPayment) {
                return res.status(403).json((0, response_1.createError)('Students can only submit their own fee payments'));
            }
            const currentUser = await User_1.User.findById(req.user?.userId).select('studentId').lean();
            selfStudent = currentUser?.studentId
                ? await Student_1.Student.findOne({ studentId: currentUser.studentId, isDeleted: false, status: 'active' }).lean()
                : null;
            if (!selfStudent) {
                return res.status(404).json((0, response_1.createError)('Student not found'));
            }
            if (req.body.studentId && String(req.body.studentId) !== String(selfStudent._id)) {
                return res.status(403).json((0, response_1.createError)('Students can only submit their own fee payments'));
            }
            const enrollments = await Enrollment_1.Enrollment.find({
                studentId: selfStudent._id,
                isDeleted: false
            }).select('classId').lean();
            const allowedClassIds = new Set([
                String(selfStudent.classId ?? ''),
                ...enrollments.map((item) => String(item.classId ?? ''))
            ].filter(Boolean));
            if (req.body.classId && !allowedClassIds.has(String(req.body.classId))) {
                return res.status(403).json((0, response_1.createError)('Selected class is not assigned to this student'));
            }
            selectedPaymentClassId = String(req.body.classId || selfStudent.classId || '');
            req.body.studentId = String(selfStudent._id);
        }
        if (isStudentPayment && !req.body.studentId) {
            return res.status(400).json((0, response_1.createError)('Student is required for student fee payment'));
        }
        if (isSalaryPayment && !payeeUserId) {
            return res.status(400).json((0, response_1.createError)('Employee is required for salary payment'));
        }
        if (isSalaryPayment && !payeeRole) {
            return res.status(400).json((0, response_1.createError)('Employee role is required for salary payment'));
        }
        if (isSalaryPayment && (!req.body.salaryMonth || !req.body.salaryYear)) {
            return res.status(400).json((0, response_1.createError)('Salary month and year are required for salary payment'));
        }
        const student = isStudentPayment
            ? selfStudent ?? await Student_1.Student.findOne({ _id: req.body.studentId, isDeleted: false, status: 'active' }).lean()
            : null;
        if (isStudentPayment && !student) {
            return res.status(404).json((0, response_1.createError)('Student not found'));
        }
        const payee = isSalaryPayment
            ? await User_1.User.findOne({
                _id: payeeUserId,
                isDeleted: false,
                active: { $ne: false },
                status: { $nin: ['inactive', 'blocked', 'expired'] }
            }).lean()
            : null;
        if (isSalaryPayment && !payee) {
            return res.status(404).json((0, response_1.createError)('Employee not found'));
        }
        if (isSalaryPayment) {
            const allowedRoles = payeeRole === 'teacher' ? ['teacher'] : ['admin', 'branch_manager', 'owner'];
            if (!allowedRoles.includes(String(payee?.role))) {
                return res.status(400).json((0, response_1.createError)('Selected employee does not match the selected salary role'));
            }
        }
        const referenceResult = await resolvePaymentReference(req.body.referenceNumber);
        if (referenceResult.error) {
            return res.status(409).json((0, response_1.createError)(referenceResult.error));
        }
        const resolvedPaymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
        if (Number.isNaN(resolvedPaymentDate.getTime())) {
            return res.status(400).json((0, response_1.createError)('Payment date is invalid'));
        }
        const invoiceNumber = await generateInvoiceNumber();
        const studentNetAmount = isStudentPayment
            ? Math.max(0, Number(req.body.amount || 0) - Number(req.body.discount || 0))
            : 0;
        const baseAmount = isSalaryPayment
            ? Number(req.body.grossSalary || req.body.amount || 0)
            : studentNetAmount;
        let grossAmount = baseAmount;
        let taxAmount = 0;
        let netAmount = baseAmount;
        let taxCategory = '';
        let taxExplanation = '';
        let remainingSalaryBalance = 0;
        const consumedSalaryRecordIds = [];
        if (isSalaryPayment) {
            const tax = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(baseAmount);
            grossAmount = Number(tax.grossSalary || baseAmount);
            taxAmount = Number(tax.taxAmount || 0);
            netAmount = Number(tax.netSalary || Math.max(0, grossAmount - taxAmount));
            taxCategory = tax.taxCategory;
            taxExplanation = tax.explanation;
            const salaryRecords = await SalaryRecord_1.SalaryRecord.find({
                userId: payeeUserId,
                isDeleted: false,
                hijriMonth: Number(req.body.salaryMonth),
                hijriYear: Number(req.body.salaryYear)
            })
                .sort({ hijriYear: 1, hijriMonth: 1, calculatedAt: 1 })
                .lean();
            let remainingNetToApply = netAmount;
            for (const record of salaryRecords) {
                if (remainingNetToApply <= 0)
                    break;
                const alreadyPaid = Number(record.paidAmount || 0);
                const remaining = Math.max(0, Number(record.netSalary || 0) - alreadyPaid);
                if (remaining <= 0)
                    continue;
                const applied = Math.min(remaining, remainingNetToApply);
                remainingNetToApply -= applied;
                const nextPaidAmount = alreadyPaid + applied;
                const isFullyPaid = nextPaidAmount >= Number(record.netSalary || 0);
                await SalaryRecord_1.SalaryRecord.updateOne({ _id: record._id }, {
                    $set: {
                        paidAmount: Number(nextPaidAmount.toFixed(2)),
                        paymentStatus: isFullyPaid ? 'paid' : 'unpaid',
                        paidAt: isFullyPaid ? new Date() : record.paidAt ?? null,
                        taxStatus: isFullyPaid ? 'paid' : record.taxStatus ?? 'pending'
                    }
                });
                consumedSalaryRecordIds.push(String(record._id));
            }
            const unpaidAggregation = await SalaryRecord_1.SalaryRecord.aggregate([
                {
                    $match: {
                        userId: payee?._id,
                        isDeleted: false
                    }
                },
                {
                    $project: {
                        remaining: {
                            $max: [
                                0,
                                { $subtract: [{ $ifNull: ['$netSalary', 0] }, { $ifNull: ['$paidAmount', 0] }] }
                            ]
                        }
                    }
                },
                { $group: { _id: null, totalRemaining: { $sum: '$remaining' } } }
            ]);
            remainingSalaryBalance = Number(unpaidAggregation[0]?.totalRemaining ?? 0);
        }
        const payment = await Payment_1.Payment.create({
            paymentFor,
            status: 'completed',
            studentId: student?._id ?? null,
            teacherId: student?.teacherId ?? null,
            classId: selectedPaymentClassId ?? req.body.classId ?? student?.classId ?? null,
            subjectId: student?.subjectId ?? null,
            payeeUserId: payee?._id ?? null,
            ...(isSalaryPayment && payeeRole ? { payeeRole } : {}),
            salaryRecordIds: consumedSalaryRecordIds,
            amount: netAmount,
            grossAmount,
            taxAmount,
            netAmount,
            remainingSalaryBalance,
            invoiceNumber,
            referenceNumber: referenceResult.referenceNumber,
            branchId: req.body.branchId ?? student?.branchId ?? payee?.branchId ?? req.user?.branchId ?? null,
            collectedBy: req.user?.userId ?? null,
            paymentDate: resolvedPaymentDate,
            method: req.body.method ?? 'cash',
            notes: req.body.notes ?? ''
        });
        if (student) {
            const paidTotals = await Payment_1.Payment.aggregate([
                {
                    $match: {
                        studentId: student._id,
                        isDeleted: false,
                        status: { $nin: ['cancelled', 'refunded'] }
                    }
                },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            const nextPaidAmount = Number(paidTotals[0]?.total ?? 0);
            const nextRemainingBalance = Number(student.feeAmount || 0) - nextPaidAmount;
            await Student_1.Student.updateOne({ _id: student._id }, {
                $set: {
                    paidAmount: nextPaidAmount,
                    remainingBalance: nextRemainingBalance
                }
            });
        }
        if (student) {
            await Expense_1.Expense.create({
                branchId: payment.branchId ?? null,
                title: `Student fee payment - ${student.firstName} ${student.lastName}`,
                amount: Number(netAmount),
                category: 'income',
                date: payment.paymentDate,
                createdBy: req.user?.userId ?? null,
                notes: req.body.notes ?? ''
            });
        }
        else if (payee) {
            await Expense_1.Expense.create({
                branchId: payment.branchId ?? null,
                title: `Salary payment - ${payee.name}`,
                amount: Number(grossAmount),
                category: 'salary',
                date: payment.paymentDate,
                createdBy: req.user?.userId ?? null,
                notes: `Gross: ${grossAmount}, Tax: ${taxAmount}, Net paid: ${netAmount}. ${req.body.notes ?? ''}`.trim()
            });
        }
        const teacher = student?.teacherId
            ? await User_1.User.findOne({ _id: student.teacherId, role: 'teacher', isDeleted: false }).lean()
            : null;
        if (teacher) {
            await teacherCompensationService_1.teacherCompensationService.recordPaymentCommission({
                payment,
                student,
                teacher,
                createdBy: req.user?.userId ?? null
            });
        }
        const populatedPayment = await Payment_1.Payment.findById(payment._id)
            .populate({ path: 'studentId', populate: studentDisplay_1.studentPopulatePaths, select: 'firstName lastName studentId rollNo remainingBalance classId subjectId teacherId branchId familyId parentProfileId familyPhone whatsapp status accountStatus' })
            .populate('payeeUserId', 'name email role')
            .lean();
        res.status(201).json((0, response_1.createResponse)(await normalizePayment(populatedPayment), 'Payment recorded successfully'));
    }
    catch (error) {
        if (error?.code === 11000 && String(error?.message ?? '').includes('referenceNumber')) {
            return res.status(409).json((0, response_1.createError)('Duplicate payment reference. Use a unique reference number.'));
        }
        if (error?.code === 11000 && String(error?.message ?? '').includes('invoiceNumber')) {
            return res.status(409).json((0, response_1.createError)('Duplicate invoice number. Please retry.'));
        }
        next(error);
    }
});
router.get('/payees', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const role = String(req.query.role || 'all');
        const filter = {
            isDeleted: false,
            active: { $ne: false },
            status: { $nin: ['inactive', 'blocked', 'expired'] },
            role: role === 'teacher'
                ? 'teacher'
                : role === 'manager'
                    ? { $in: ['admin', 'branch_manager', 'owner'] }
                    : { $in: ['teacher', 'admin', 'branch_manager', 'owner'] }
        };
        if (req.query.branchId) {
            filter.branchId = req.query.branchId;
        }
        if (req.user?.canonicalRole === 'branch_manager' && req.user?.branchId) {
            filter.branchId = req.user.branchId;
        }
        const users = await User_1.User.find(filter).select('name role branchId salaryType fixedSalary percentageRate customPercentage').lean();
        const payload = users.map((user) => ({
            value: String(user._id),
            label: user.name,
            role: user.role === 'teacher' ? 'teacher' : 'manager',
            salaryType: user.salaryType,
            fixedSalary: Number(user.fixedSalary || 0),
            percentageRate: Number(user.customPercentage || user.percentageRate || 0),
            branchId: user.branchId ? String(user.branchId) : ''
        }));
        res.json((0, response_1.createResponse)(payload));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id/invoice', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner', 'student', 'parent']), async (req, res, next) => {
    try {
        const payment = await Payment_1.Payment.findById(req.params.id)
            .populate({ path: 'studentId', populate: studentDisplay_1.studentPopulatePaths, select: 'firstName lastName studentId rollNo feeAmount paidAmount remainingBalance classId subjectId teacherId branchId familyId parentProfileId familyPhone whatsapp status accountStatus' })
            .populate('collectedBy', 'name email')
            .lean();
        if (!payment || payment.isDeleted) {
            return res.status(404).json((0, response_1.createError)('Payment invoice not found'));
        }
        const normalizedPayment = await normalizePayment(payment);
        res.json((0, response_1.createResponse)({
            ...normalizedPayment,
            issuedAt: payment.paymentDate,
            collectedByName: payment.collectedBy?.name ?? '',
            studentFeeAmount: Number(payment.studentId?.feeAmount ?? 0),
            totalPaidAmount: Number(payment.studentId?.paidAmount ?? 0)
        }));
    }
    catch (error) {
        next(error);
    }
});
exports.paymentRouter = router;
