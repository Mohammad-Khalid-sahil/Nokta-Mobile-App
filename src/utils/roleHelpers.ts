import { enterprisePermissions, enterpriseRoles, legacyRoleAliases, rolePermissionMatrix, type CanonicalRole, type PermissionKey, type SupportedRole } from '../config/systemMasterRules';

const permissionLookup = new Set<string>(enterprisePermissions);

const legacyActionMap: Record<string, string> = {
  create: 'CREATE',
  read: 'VIEW',
  view: 'VIEW',
  update: 'UPDATE',
  delete: 'DELETE'
};

const legacyModuleMap: Record<string, string> = {
  users: 'USER',
  user: 'USER',
  students: 'STUDENT',
  student: 'STUDENT',
  teachers: 'TEACHER',
  teacher: 'TEACHER',
  classes: 'CLASS',
  class: 'CLASS',
  subjects: 'SUBJECT',
  subject: 'SUBJECT',
  courses: 'COURSE',
  course: 'COURSE',
  curriculum: 'CURRICULUM',
  attendance: 'ATTENDANCE',
  exams: 'EXAM',
  exam: 'EXAM',
  results: 'RESULT',
  result: 'RESULT',
  payments: 'PAYMENT',
  payment: 'PAYMENT',
  finance: 'FINANCE',
  expenses: 'EXPENSE',
  expense: 'EXPENSE',
  families: 'FAMILY_LINK',
  family: 'FAMILY_LINK',
  family_link: 'FAMILY_LINK',
  books: 'RESOURCE',
  resources: 'RESOURCE',
  resource: 'RESOURCE',
  notifications: 'NOTIFICATION',
  notification: 'NOTIFICATION',
  audit: 'AUDIT',
  roles: 'ROLE',
  role: 'ROLE',
  permissions: 'PERMISSION',
  permission: 'PERMISSION',
  branches: 'BRANCH',
  branch: 'BRANCH',
  reports: 'REPORT',
  report: 'REPORT',
  ai_assistant: 'AI_ASSISTANT',
  dashboard: 'DASHBOARD'
};

export function normalizeRole(role?: string | null): CanonicalRole | undefined {
  if (!role) {
    return undefined;
  }

  const value = role.toLowerCase() as SupportedRole;
  if ((enterpriseRoles as readonly string[]).includes(value)) {
    return value as CanonicalRole;
  }

  return legacyRoleAliases[value as keyof typeof legacyRoleAliases];
}

export function roleMatches(userRole: string | null | undefined, allowedRoles: Array<string | null | undefined>) {
  const normalizedUserRole = normalizeRole(userRole);
  if (!normalizedUserRole) {
    return false;
  }

  return allowedRoles.some((allowedRole) => normalizeRole(allowedRole) === normalizedUserRole);
}

export function permissionFromLegacy(moduleKey: string, action: string): PermissionKey | undefined {
  const modulePrefix = legacyModuleMap[moduleKey];
  const actionSuffix = legacyActionMap[action] ?? action.toUpperCase();

  if (!modulePrefix || !actionSuffix) {
    return undefined;
  }

  const candidate = `${modulePrefix}_${actionSuffix}`;
  if (permissionLookup.has(candidate)) {
    return candidate as PermissionKey;
  }

  return undefined;
}

export function permissionFromRoute(pathname: string, method: string): PermissionKey | undefined {
  const routePath = pathname.replace(/^\/api\/?/, '');
  const [moduleKey, nestedAction] = routePath.split('/').filter(Boolean);
  const normalizedMethod = method.toUpperCase();

  if (moduleKey === 'attendance' && normalizedMethod === 'POST') {
    return 'ATTENDANCE_MARK';
  }

  if (moduleKey === 'reports' && nestedAction === 'generate' && normalizedMethod === 'POST') {
    return 'REPORT_GENERATE';
  }

  if (moduleKey === 'branches' && nestedAction === 'request-delete' && normalizedMethod === 'POST') {
    return 'BRANCH_DELETE_REQUEST';
  }

  if (moduleKey === 'branches' && nestedAction === 'approve-delete' && normalizedMethod === 'POST') {
    return 'BRANCH_DELETE_APPROVE';
  }

  const action =
    normalizedMethod === 'GET' || normalizedMethod === 'HEAD'
      ? 'read'
      : normalizedMethod === 'POST'
        ? 'create'
        : normalizedMethod === 'PUT' || normalizedMethod === 'PATCH'
          ? 'update'
          : normalizedMethod === 'DELETE'
            ? 'delete'
            : '';

  return moduleKey && action ? permissionFromLegacy(moduleKey, action) : undefined;
}

export function flattenLegacyPermissionMap(value: unknown): PermissionKey[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const permissions: PermissionKey[] = [];
  for (const [moduleKey, actions] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(actions)) {
      continue;
    }

    for (const action of actions) {
      if (typeof action !== 'string') {
        continue;
      }

      const permission = permissionFromLegacy(moduleKey, action);
      if (permission) {
        permissions.push(permission);
      }
    }
  }

  return Array.from(new Set(permissions));
}

export function getRolePermissions(role?: string | null): PermissionKey[] | ['*'] {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return [];
  }

  return rolePermissionMatrix[normalizedRole];
}

export function collectUserPermissions(user: {
  role?: string | null;
  rolePermissionKeys?: string[];
  permissionKeys?: string[];
  revokedPermissionKeys?: string[];
  permissions?: unknown;
} | null | undefined): PermissionKey[] | ['*'] {
  const rolePermissionOverride = Array.isArray(user?.rolePermissionKeys) && user?.rolePermissionKeys.length
    ? user.rolePermissionKeys.filter((permission): permission is PermissionKey => permissionLookup.has(permission))
    : null;

  const basePermissions = rolePermissionOverride ?? getRolePermissions(user?.role);
  const grantedByLegacyMap = flattenLegacyPermissionMap(user?.permissions);
  const grantedByUser = Array.isArray(user?.permissionKeys) ? user!.permissionKeys : [];
  const revokedByUser = new Set(Array.isArray(user?.revokedPermissionKeys) ? user!.revokedPermissionKeys : []);
  const grantedByRole = new Set<string>(basePermissions[0] === '*' ? enterprisePermissions : basePermissions as PermissionKey[]);

  const granted = new Set<string>([...grantedByRole, ...grantedByLegacyMap, ...grantedByUser]);
  for (const revoked of revokedByUser) {
    granted.delete(revoked);
  }

  return Array.from(granted).filter((permission): permission is PermissionKey => permissionLookup.has(permission));
}

export function hasPermission(
  user: {
    role?: string | null;
    rolePermissionKeys?: string[];
    permissionKeys?: string[];
    revokedPermissionKeys?: string[];
    permissions?: unknown;
  } | null | undefined,
  permission: PermissionKey
) {
  const permissions = collectUserPermissions(user);
  return permissions[0] === '*' || (permissions as PermissionKey[]).includes(permission);
}
