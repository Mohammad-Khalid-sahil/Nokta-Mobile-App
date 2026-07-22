"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const payrollCalculation_service_1 = require("./payrollCalculation.service");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
const teacherNote = (0, payrollCalculation_service_1.buildCommissionScopeNote)('teacher_assigned_students', 12, 30, 10000, 3000);
assert(teacherNote.includes('شاگرد اختصاصی'), 'teacher note should mention assigned students');
assert(teacherNote.includes('12'), 'teacher note should include student count');
const managerBranchNote = (0, payrollCalculation_service_1.buildCommissionScopeNote)('branch_all_students', 0, 5, 50000, 2500);
assert(managerBranchNote.includes('تمام شاگردان این نماینده'), 'manager branch note should mention all branch students');
const managerSystemNote = (0, payrollCalculation_service_1.buildCommissionScopeNote)('system_all_students', 0, 5, 50000, 2500);
assert(managerSystemNote.includes('تمام شاگردان سیستم'), 'manager system note should mention all system students');
console.log('payroll commission scope tests passed');
