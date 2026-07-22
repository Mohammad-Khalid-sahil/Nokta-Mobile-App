"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const teacherCompensationService_1 = require("./teacherCompensationService");
function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
assert((0, teacherCompensationService_1.calculateCommissionAmount)(1000, 30) + (0, teacherCompensationService_1.calculateCommissionAmount)(1000, 30) + (0, teacherCompensationService_1.calculateCommissionAmount)(1000, 30) === 900, '3 students paying 1000 AFN at 30% should earn 900 AFN total');
assert(!(0, teacherCompensationService_1.isEligiblePaymentStatus)('pending'), 'pending payment must not count');
assert((0, teacherCompensationService_1.isExcludedPaymentStatus)('refunded'), 'refunded payment must be excluded');
assert((0, teacherCompensationService_1.isExcludedPaymentStatus)('cancelled'), 'cancelled payment must be excluded');
assert((0, teacherCompensationService_1.isEligiblePaymentStatus)('completed'), 'completed payment must count');
assert((0, teacherCompensationService_1.calculateTeacherPayable)({ salaryMode: 'fixed_salary', fixedSalaryAmount: 5000, commissionEarned: 900 }) === 5000, 'fixed salary must not multiply by students');
assert((0, teacherCompensationService_1.calculateTeacherPayable)({ salaryMode: 'fixed_plus_percentage', fixedSalaryAmount: 5000, commissionEarned: 900 }) === 5900, 'fixed_plus_percentage must add fixed and commission');
assert((0, teacherCompensationService_1.calculateTeacherPayable)({ salaryMode: 'percentage', fixedSalaryAmount: 5000, commissionEarned: 900 }) === 900, 'percentage mode must only use commission');
assert((0, teacherCompensationService_1.earnsCommission)('percentage'), 'percentage teachers earn commission');
assert((0, teacherCompensationService_1.earnsCommission)('fixed_plus_percentage'), 'fixed_plus_percentage teachers earn commission');
assert(!(0, teacherCompensationService_1.earnsCommission)('fixed'), 'fixed teachers must not earn commission');
assert((0, teacherCompensationService_1.normalizeSalaryMode)('fixed') === 'fixed_salary', 'fixed maps to fixed_salary');
assert((0, teacherCompensationService_1.resolveCommissionPercentage)({ customPercentage: 25, percentageRate: 30 }) === 25, 'custom percentage wins');
assert((0, teacherCompensationService_1.resolveCommissionPercentage)({ customPercentage: 0, percentageRate: 30 }) === 30, 'fallback to percentageRate');
assert((0, teacherCompensationService_1.calculateUnpaidPayable)(5900, 2000) === 3900, 'unpaid payable must subtract paid amount');
console.log('teacherCompensationService tests passed');
