"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middlewares/auth");
const response_1 = require("../../helpers/response");
const systemMasterRules_1 = require("../../config/systemMasterRules");
const Permission_1 = require("../../models/Permission");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'owner']));
function parsePermission(permission) {
    const segments = permission.toLowerCase().split('_');
    const action = segments.pop() ?? 'view';
    const module = segments.join('_');
    return { key: permission, module, action };
}
router.get('/template', (_req, res) => {
    const groupedModules = systemMasterRules_1.enterprisePermissions.reduce((acc, permission) => {
        const { module, action } = parsePermission(permission);
        if (!acc[module]) {
            acc[module] = new Set();
        }
        acc[module].add(action);
        return acc;
    }, {});
    const modules = Object.entries(groupedModules).map(([key, actions]) => ({
        key,
        label: key,
        actions: Array.from(actions).sort()
    }));
    const roleTemplates = Object.entries(systemMasterRules_1.rolePermissionMatrix).reduce((acc, [role, permissions]) => {
        if (permissions[0] === '*') {
            acc[role] = modules.reduce((moduleAcc, module) => {
                moduleAcc[module.key] = [...module.actions];
                return moduleAcc;
            }, {});
            return acc;
        }
        acc[role] = permissions.reduce((moduleAcc, permission) => {
            const { module, action } = parsePermission(permission);
            moduleAcc[module] = Array.from(new Set([...(moduleAcc[module] ?? []), action])).sort();
            return moduleAcc;
        }, {});
        return acc;
    }, {});
    res.json((0, response_1.createResponse)({
        modules,
        roleTemplates
    }));
});
router.get('/', async (_req, res, next) => {
    try {
        const permissions = await Permission_1.Permission.find({ isDeleted: false }).sort({ module: 1, action: 1 }).lean();
        if (permissions.length) {
            return res.json((0, response_1.createResponse)(permissions));
        }
        res.json((0, response_1.createResponse)(systemMasterRules_1.enterprisePermissions.map(parsePermission)));
    }
    catch (error) {
        next(error);
    }
});
exports.permissionsRouter = router;
