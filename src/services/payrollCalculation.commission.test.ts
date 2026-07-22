import { buildCommissionScopeNote } from './payrollCalculation.service';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const teacherNote = buildCommissionScopeNote('teacher_assigned_students', 12, 30, 10000, 3000);
assert(teacherNote.includes('شاگرد اختصاصی'), 'teacher note should mention assigned students');
assert(teacherNote.includes('12'), 'teacher note should include student count');

const managerBranchNote = buildCommissionScopeNote('branch_all_students', 0, 5, 50000, 2500);
assert(managerBranchNote.includes('تمام شاگردان این نماینده'), 'manager branch note should mention all branch students');

const managerSystemNote = buildCommissionScopeNote('system_all_students', 0, 5, 50000, 2500);
assert(managerSystemNote.includes('تمام شاگردان سیستم'), 'manager system note should mention all system students');

console.log('payroll commission scope tests passed');
