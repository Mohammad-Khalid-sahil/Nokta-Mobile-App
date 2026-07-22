"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Branch_1 = require("../../models/Branch");
const Role_1 = require("../../models/Role");
const User_1 = require("../../models/User");
const systemMasterRules_1 = require("../../config/systemMasterRules");
const roleProfileService_1 = require("../../services/roleProfileService");
const router = (0, express_1.Router)();
const roleProfileService = new roleProfileService_1.RoleProfileService();
const roleScopes = ['global', 'operational', 'instructional', 'self', 'linked-family', 'governance', 'branch', 'service'];
const createRoleSchema = joi_1.default.object({
    body: joi_1.default.object({
        slug: joi_1.default.string().valid(...systemMasterRules_1.enterpriseRoles).required(),
        name: joi_1.default.string().trim().required(),
        description: joi_1.default.string().allow('', null).optional(),
        scope: joi_1.default.string().valid(...roleScopes).required(),
        permissionKeys: joi_1.default.array().items(joi_1.default.string().valid(...systemMasterRules_1.enterprisePermissions)).min(1).required()
    })
});
const updateRoleSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: joi_1.default.string().trim().optional(),
        description: joi_1.default.string().allow('', null).optional(),
        scope: joi_1.default.string().valid(...roleScopes).optional(),
        permissionKeys: joi_1.default.array().items(joi_1.default.string().valid(...systemMasterRules_1.enterprisePermissions)).min(1).optional()
    }).min(1)
});
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'owner']));
function toTitleCase(value) {
    return value
        .split('_')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}
function parsePermission(permission) {
    const segments = permission.toLowerCase().split('_');
    const action = segments.pop() ?? 'view';
    return {
        key: permission,
        module: segments.join('_'),
        action
    };
}
async function buildRoleSummary(slug) {
    const [roleDoc, totalBranches] = await Promise.all([
        Role_1.Role.findOne({ slug, isDeleted: false }).lean(),
        Branch_1.Branch.countDocuments({ isDeleted: false })
    ]);
    const acceptedRoles = roleProfileService.getAcceptedRoles(slug);
    const [userCount, distinctBranches] = await Promise.all([
        User_1.User.countDocuments({ role: { $in: acceptedRoles }, isDeleted: false }),
        User_1.User.distinct('branchId', { role: { $in: acceptedRoles }, branchId: { $ne: null }, isDeleted: false })
    ]);
    const permissionKeys = roleDoc?.permissionKeys?.length
        ? roleProfileService.normalizePermissionKeys(slug, roleDoc.permissionKeys)
        : roleProfileService.getDefaultPermissionKeys(slug);
    return {
        key: roleDoc?.key ?? slug.toUpperCase(),
        slug,
        name: roleDoc?.name ?? toTitleCase(slug),
        description: roleDoc?.description ?? `${toTitleCase(slug)} role configuration`,
        scope: roleDoc?.scope ?? (['super_admin', 'owner', 'system_automation'].includes(slug) ? 'global' : 'branch'),
        isSystemRole: roleDoc?.isSystemRole ?? true,
        hasCustomization: Boolean(roleDoc),
        userCount,
        branchAccess: {
            scope: ['super_admin', 'owner', 'system_automation'].includes(slug) ? 'all' : 'assigned',
            count: ['super_admin', 'owner', 'system_automation'].includes(slug) ? totalBranches : distinctBranches.filter(Boolean).length
        },
        permissionCount: permissionKeys.length,
        permissionKeys,
        permissions: permissionKeys.map(parsePermission)
    };
}
router.get('/', async (_req, res, next) => {
    try {
        const roles = await Promise.all(systemMasterRules_1.enterpriseRoles.map((slug) => buildRoleSummary(slug)));
        res.json((0, response_1.createResponse)(roles));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', (0, validate_1.validate)(createRoleSchema), async (req, res, next) => {
    try {
        const slug = req.body.slug;
        const existingRole = await Role_1.Role.findOne({ slug, isDeleted: false }).lean();
        if (existingRole) {
            return res.status(409).json((0, response_1.createError)('Role customization already exists for this slug'));
        }
        const payload = {
            key: slug.toUpperCase(),
            slug,
            name: String(req.body.name).trim(),
            description: String(req.body.description ?? '').trim(),
            scope: req.body.scope,
            isSystemRole: true,
            permissionKeys: roleProfileService.normalizePermissionKeys(slug, req.body.permissionKeys)
        };
        const archivedRole = await Role_1.Role.findOne({ slug }).sort({ updatedAt: -1 });
        if (archivedRole) {
            archivedRole.set(payload);
            archivedRole.set('isDeleted', false);
            await archivedRole.save();
        }
        else {
            await Role_1.Role.create(payload);
        }
        res.status(201).json((0, response_1.createResponse)(await buildRoleSummary(slug), 'Role customization created successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.put('/:slug', (0, validate_1.validate)(updateRoleSchema), async (req, res, next) => {
    try {
        const slug = String(req.params.slug).toLowerCase();
        if (!systemMasterRules_1.enterpriseRoles.includes(slug)) {
            return res.status(400).json((0, response_1.createError)('Unsupported role slug'));
        }
        const roleDoc = await Role_1.Role.findOne({ slug, isDeleted: false });
        if (!roleDoc) {
            return res.status(404).json((0, response_1.createError)('Role customization not found'));
        }
        roleDoc.name = String(req.body.name ?? roleDoc.name).trim();
        roleDoc.description = String(req.body.description ?? roleDoc.description ?? '').trim();
        roleDoc.scope = req.body.scope ?? roleDoc.scope;
        if (req.body.permissionKeys) {
            roleDoc.permissionKeys = roleProfileService.normalizePermissionKeys(slug, req.body.permissionKeys);
        }
        await roleDoc.save();
        res.json((0, response_1.createResponse)(await buildRoleSummary(slug), 'Role customization updated successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:slug', async (req, res, next) => {
    try {
        const slug = String(req.params.slug).toLowerCase();
        if (!systemMasterRules_1.enterpriseRoles.includes(slug)) {
            return res.status(400).json((0, response_1.createError)('Unsupported role slug'));
        }
        const roleDoc = await Role_1.Role.findOne({ slug, isDeleted: false });
        if (!roleDoc) {
            return res.status(404).json((0, response_1.createError)('Role customization not found'));
        }
        roleDoc.set('isDeleted', true);
        await roleDoc.save();
        res.json((0, response_1.createResponse)(await buildRoleSummary(slug), 'Role customization removed. Default permissions restored.'));
    }
    catch (error) {
        next(error);
    }
});
exports.roleRouter = router;
