import { canAccessStudentInsight, isPrivilegedRole } from './ai-results.access';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(isPrivilegedRole('admin'), 'admin should be privileged');
assert(!isPrivilegedRole('teacher'), 'teacher should not be privileged');

assert(
  canAccessStudentInsight({
    role: 'student',
    requestUserId: 'u1',
    studentId: 'u1'
  }),
  'student can access own insight'
);

assert(
  !canAccessStudentInsight({
    role: 'student',
    requestUserId: 'u1',
    studentId: 'u2'
  }),
  'student cannot access another student insight'
);

assert(
  canAccessStudentInsight({
    role: 'teacher',
    requestUserId: 't1',
    studentId: 's1',
    assignedTeacherId: 't1'
  }),
  'teacher can access assigned student'
);

assert(
  !canAccessStudentInsight({
    role: 'teacher',
    requestUserId: 't1',
    studentId: 's1',
    assignedTeacherId: 't2'
  }),
  'teacher cannot access unassigned student'
);

assert(
  canAccessStudentInsight({
    role: 'parent',
    requestUserId: 'p1',
    studentId: 's1',
    familyLinked: true
  }),
  'parent can access linked student'
);

assert(
  !canAccessStudentInsight({
    role: 'parent',
    requestUserId: 'p1',
    studentId: 's1',
    familyLinked: false
  }),
  'parent cannot access unlinked student'
);

assert(
  canAccessStudentInsight({
    role: 'branch_manager',
    requestUserId: 'bm1',
    studentId: 's1',
    requestBranchId: 'b1',
    studentBranchId: 'b1'
  }),
  'branch manager can access same branch student'
);

console.log('ai-results access tests passed');
