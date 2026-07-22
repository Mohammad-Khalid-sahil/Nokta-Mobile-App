export function isPrivilegedRole(role: string) {
  return ['super_admin', 'admin', 'owner'].includes(role);
}

export type StudentAccessContext = {
  role: string;
  requestUserId: string;
  studentId: string;
  requestBranchId?: string | null;
  studentBranchId?: string | null;
  assignedTeacherId?: string | null;
  familyLinked?: boolean;
};

export function canAccessStudentInsight(context: StudentAccessContext): boolean {
  const role = context.role;

  if (isPrivilegedRole(role)) return true;

  if (role === 'student') {
    return String(context.requestUserId) === String(context.studentId);
  }

  if (role === 'teacher') {
    return String(context.assignedTeacherId ?? '') === String(context.requestUserId);
  }

  if (role === 'branch_manager') {
    return String(context.studentBranchId ?? '') === String(context.requestBranchId ?? '');
  }

  if (role === 'parent' || role === 'family_student') {
    return Boolean(context.familyLinked);
  }

  return false;
}
