"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFamily = exports.requireTeacher = exports.requireAdmin = exports.requireSuperAdmin = exports.requireRole = void 0;
const response_1 = require("../helpers/response");
const roleHelpers_1 = require("../utils/roleHelpers");
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        const user = req.user;
        if (!user) {
            return res.status(401).json((0, response_1.createError)('Authentication required'));
        }
        if (!(0, roleHelpers_1.roleMatches)(user.role, allowedRoles)) {
            return res.status(403).json((0, response_1.createError)('Insufficient permissions'));
        }
        next();
    };
};
exports.requireRole = requireRole;
exports.requireSuperAdmin = (0, exports.requireRole)('super_admin');
exports.requireAdmin = (0, exports.requireRole)('super_admin', 'admin', 'branch_manager');
exports.requireTeacher = (0, exports.requireRole)('super_admin', 'admin', 'branch_manager', 'teacher');
exports.requireFamily = (0, exports.requireRole)('super_admin', 'admin', 'branch_manager', 'teacher', 'parent', 'family_student', 'family');
