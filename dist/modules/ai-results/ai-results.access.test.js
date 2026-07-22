"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ai_results_access_1 = require("./ai-results.access");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
assert((0, ai_results_access_1.isPrivilegedRole)('admin'), 'admin should be privileged');
assert(!(0, ai_results_access_1.isPrivilegedRole)('teacher'), 'teacher should not be privileged');
assert((0, ai_results_access_1.canAccessStudentInsight)({
    role: 'student',
    requestUserId: 'u1',
    studentId: 'u1'
}), 'student can access own insight');
assert(!(0, ai_results_access_1.canAccessStudentInsight)({
    role: 'student',
    requestUserId: 'u1',
    studentId: 'u2'
}), 'student cannot access another student insight');
assert((0, ai_results_access_1.canAccessStudentInsight)({
    role: 'teacher',
    requestUserId: 't1',
    studentId: 's1',
    assignedTeacherId: 't1'
}), 'teacher can access assigned student');
assert(!(0, ai_results_access_1.canAccessStudentInsight)({
    role: 'teacher',
    requestUserId: 't1',
    studentId: 's1',
    assignedTeacherId: 't2'
}), 'teacher cannot access unassigned student');
assert((0, ai_results_access_1.canAccessStudentInsight)({
    role: 'parent',
    requestUserId: 'p1',
    studentId: 's1',
    familyLinked: true
}), 'parent can access linked student');
assert(!(0, ai_results_access_1.canAccessStudentInsight)({
    role: 'parent',
    requestUserId: 'p1',
    studentId: 's1',
    familyLinked: false
}), 'parent cannot access unlinked student');
assert((0, ai_results_access_1.canAccessStudentInsight)({
    role: 'branch_manager',
    requestUserId: 'bm1',
    studentId: 's1',
    requestBranchId: 'b1',
    studentBranchId: 'b1'
}), 'branch manager can access same branch student');
console.log('ai-results access tests passed');
