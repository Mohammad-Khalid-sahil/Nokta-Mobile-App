import type { CanonicalRole, LegacyRole, PermissionKey } from '../config/systemMasterRules';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

export type RoleType = CanonicalRole | LegacyRole;

export interface AuthenticatedUser {
  userId: string;
  role: RoleType;
  canonicalRole?: CanonicalRole;
  branchId?: string | null;
  sessionId?: string | null;
  permissionKeys?: PermissionKey[];
  revokedPermissionKeys?: PermissionKey[];
  permissions?: Record<string, string[]>;
  rolePermissionKeys?: PermissionKey[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}
