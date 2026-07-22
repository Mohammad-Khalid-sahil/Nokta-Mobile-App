import type { Request, Response, NextFunction } from 'express';
import { createError } from '../helpers/response';
import { roleMatches } from '../utils/roleHelpers';

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json(createError('Authentication required'));
    }

    if (!roleMatches(user.role, allowedRoles)) {
      return res.status(403).json(createError('Insufficient permissions'));
    }

    next();
  };
};

export const requireSuperAdmin = requireRole('super_admin');
export const requireAdmin = requireRole('super_admin', 'admin', 'branch_manager');
export const requireTeacher = requireRole('super_admin', 'admin', 'branch_manager', 'teacher');
export const requireFamily = requireRole('super_admin', 'admin', 'branch_manager', 'teacher', 'parent', 'family_student', 'family');
