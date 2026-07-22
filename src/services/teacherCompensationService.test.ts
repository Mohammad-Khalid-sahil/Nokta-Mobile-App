import {
  calculateCommissionAmount,
  calculateTeacherPayable,
  calculateUnpaidPayable,
  earnsCommission,
  isEligiblePaymentStatus,
  isExcludedPaymentStatus,
  normalizeSalaryMode,
  resolveCommissionPercentage
} from './teacherCompensationService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  calculateCommissionAmount(1000, 30) + calculateCommissionAmount(1000, 30) + calculateCommissionAmount(1000, 30) === 900,
  '3 students paying 1000 AFN at 30% should earn 900 AFN total'
);

assert(!isEligiblePaymentStatus('pending'), 'pending payment must not count');
assert(isExcludedPaymentStatus('refunded'), 'refunded payment must be excluded');
assert(isExcludedPaymentStatus('cancelled'), 'cancelled payment must be excluded');
assert(isEligiblePaymentStatus('completed'), 'completed payment must count');

assert(calculateTeacherPayable({ salaryMode: 'fixed_salary', fixedSalaryAmount: 5000, commissionEarned: 900 }) === 5000, 'fixed salary must not multiply by students');
assert(
  calculateTeacherPayable({ salaryMode: 'fixed_plus_percentage', fixedSalaryAmount: 5000, commissionEarned: 900 }) === 5900,
  'fixed_plus_percentage must add fixed and commission'
);
assert(
  calculateTeacherPayable({ salaryMode: 'percentage', fixedSalaryAmount: 5000, commissionEarned: 900 }) === 900,
  'percentage mode must only use commission'
);

assert(earnsCommission('percentage'), 'percentage teachers earn commission');
assert(earnsCommission('fixed_plus_percentage'), 'fixed_plus_percentage teachers earn commission');
assert(!earnsCommission('fixed'), 'fixed teachers must not earn commission');

assert(normalizeSalaryMode('fixed') === 'fixed_salary', 'fixed maps to fixed_salary');
assert(resolveCommissionPercentage({ customPercentage: 25, percentageRate: 30 }) === 25, 'custom percentage wins');
assert(resolveCommissionPercentage({ customPercentage: 0, percentageRate: 30 }) === 30, 'fallback to percentageRate');

assert(calculateUnpaidPayable(5900, 2000) === 3900, 'unpaid payable must subtract paid amount');

console.log('teacherCompensationService tests passed');
