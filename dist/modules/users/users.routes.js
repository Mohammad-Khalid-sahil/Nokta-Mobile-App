"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const User_1 = require("../../models/User");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const pagination_1 = require("../../validators/pagination");
const recordVisibility_1 = require("../../utils/recordVisibility");
const password_1 = require("../../utils/password");
const accountNormalization_1 = require("../../utils/accountNormalization");
const roleHelpers_1 = require("../../utils/roleHelpers");
const systemMasterRules_1 = require("../../config/systemMasterRules");
const fieldSchemas_1 = require("../../validators/fieldSchemas");
const router = (0, express_1.Router)();
const createSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: (0, fieldSchemas_1.personNameField)(false),
        fullName: (0, fieldSchemas_1.personNameField)(false),
        email: joi_1.default.string().email().max(160).required(),
        password: joi_1.default.string().min(8).max(64).required(),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        profileImage: joi_1.default.string().allow('', null).optional(),
        branchId: joi_1.default.string().hex().length(24).required(),
        status: joi_1.default.string().valid('active', 'inactive', 'blocked').optional(),
        role: joi_1.default.string().valid('super_admin', 'admin', 'teacher', 'student', 'parent', 'owner', 'branch_manager', 'system_automation', 'family_student', 'accountant', 'librarian').required()
    }).or('name', 'fullName')
});
const updateSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: joi_1.default.string(),
        email: joi_1.default.string().email(),
        password: joi_1.default.string().min(8).max(64).optional(),
        profileImage: joi_1.default.string().allow('', null).optional(),
        branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        role: joi_1.default.string().valid('super_admin', 'admin', 'teacher', 'student', 'parent', 'owner', 'branch_manager', 'system_automation', 'family_student', 'accountant', 'librarian'),
        active: joi_1.default.boolean()
    }),
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() })
});
const permissionsSchema = joi_1.default.object({
    body: joi_1.default.object({
        permissions: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.array().items(joi_1.default.string().trim().min(1)).unique()).required()
    }),
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() })
});
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() })
});
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin']));
function requireAccess(req, res, permission) {
    if (req.user?.role !== 'super_admin' && !(0, roleHelpers_1.hasPermission)(req.user, permission)) {
        res.status(403).json((0, response_1.createError)('Forbidden'));
        return false;
    }
    return true;
}
function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}
function permissionKeyToLegacy(permission) {
    const parts = permission.toLowerCase().split('_');
    const action = parts.pop() ?? 'view';
    return { module: parts.join('_'), action };
}
function permissionKeysToMap(permissionKeys) {
    return permissionKeys.reduce((acc, permission) => {
        const { module, action } = permissionKeyToLegacy(permission);
        acc[module] = Array.from(new Set([...(acc[module] ?? []), action])).sort();
        return acc;
    }, {});
}
function normalizePermissionMap(permissions) {
    return Object.entries(permissions ?? {}).reduce((acc, [moduleKey, actions]) => {
        const validActions = (Array.isArray(actions) ? actions : [])
            .map((action) => String(action).trim().toLowerCase())
            .filter((action) => (0, roleHelpers_1.permissionFromLegacy)(moduleKey, action));
        if (validActions.length) {
            acc[moduleKey] = Array.from(new Set(validActions)).sort();
        }
        return acc;
    }, {});
}
function permissionMapToKeys(permissions) {
    const keys = Object.entries(permissions).flatMap(([moduleKey, actions]) => (actions
        .map((action) => (0, roleHelpers_1.permissionFromLegacy)(moduleKey, action))
        .filter((permission) => Boolean(permission))));
    return Array.from(new Set(keys));
}
function serializeUser(user) {
    const effectivePermissions = (0, roleHelpers_1.collectUserPermissions)(user);
    const effectivePermissionKeys = effectivePermissions[0] === '*' ? [...systemMasterRules_1.enterprisePermissions] : effectivePermissions;
    const branchRef = user?.branchId;
    return {
        ...user,
        branchId: branchRef?._id ?? branchRef ?? null,
        branchName: branchRef?.name ?? branchRef?.code ?? '',
        phone: user?.phone ?? user?.whatsapp ?? '',
        permissions: permissionKeysToMap(effectivePermissionKeys),
        permissionKeys: Array.isArray(user.permissionKeys) ? user.permissionKeys : [],
        revokedPermissionKeys: Array.isArray(user.revokedPermissionKeys) ? user.revokedPermissionKeys : [],
        effectivePermissionKeys
    };
}
router.post('/', (0, validate_1.validate)(createSchema), async (req, res, next) => {
    try {
        if (!requireAccess(req, res, 'USER_CREATE'))
            return;
        const account = (0, accountNormalization_1.buildUserAccountPayload)(req.body);
        const normalizedEmail = normalizeEmail(account.email);
        const exists = await User_1.User.findOne({ email: normalizedEmail, isDeleted: false }).lean();
        if (exists)
            return res.status(409).json((0, response_1.createError)('Email already exists'));
        const hashed = await (0, password_1.hashPassword)(req.body.password);
        const user = await User_1.User.create({
            name: account.name,
            email: normalizedEmail,
            phone: account.phone,
            password: hashed,
            role: account.role || req.body.role,
            profileImage: account.profileImage,
            branchId: account.branchId || null,
            status: account.status,
            active: account.active
        });
        res.status(201).json((0, response_1.createResponse)({ id: user._id, name: user.name, email: user.email, role: user.role, profileImage: user.profileImage }, 'User created'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        if (!requireAccess(req, res, 'USER_VIEW'))
            return;
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const visibilityFilter = (0, recordVisibility_1.listRecordFilter)(req.user);
        const filter = search
            ? { ...visibilityFilter, $or: [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] }
            : { ...visibilityFilter };
        const [users, total] = await Promise.all([
            User_1.User.find(filter).select('-password').populate('branchId', 'name code city').lean().skip((page - 1) * limit).limit(limit),
            User_1.User.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(users.map(serializeUser), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/count', async (req, res, next) => {
    try {
        if (!req.user)
            return res.status(401).json((0, response_1.createError)('Authentication required'));
        if (!['super_admin', 'admin'].includes(req.user.role)) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        const count = await User_1.User.countDocuments();
        res.json((0, response_1.createResponse)({ count }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        if (!requireAccess(req, res, 'USER_VIEW'))
            return;
        const user = await User_1.User.findOne({ _id: req.params.id, isDeleted: false }).select('-password').populate('branchId', 'name code city').lean();
        if (!user)
            return res.status(404).json((0, response_1.createError)('User not found'));
        res.json((0, response_1.createResponse)(serializeUser(user)));
    }
    catch (error) {
        next(error);
    }
});
const updateUserHandler = async (req, res, next) => {
    try {
        if (!requireAccess(req, res, 'USER_UPDATE'))
            return;
        if (req.body.email) {
            const normalizedEmail = normalizeEmail(req.body.email);
            const existingUser = await User_1.User.findOne({ email: normalizedEmail, _id: { $ne: req.params.id }, isDeleted: false }).lean();
            if (existingUser) {
                return res.status(409).json((0, response_1.createError)('Email already exists'));
            }
            req.body.email = normalizedEmail;
        }
        const updatePayload = { ...req.body };
        if (updatePayload.password) {
            updatePayload.password = await (0, password_1.hashPassword)(updatePayload.password);
        }
        else {
            delete updatePayload.password;
        }
        const user = await User_1.User.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, updatePayload, { new: true, runValidators: true }).select('-password').populate('branchId', 'name code city').lean();
        if (!user)
            return res.status(404).json((0, response_1.createError)('User not found'));
        res.json((0, response_1.createResponse)(serializeUser(user), 'User updated'));
    }
    catch (error) {
        next(error);
    }
};
router.patch('/:id', (0, validate_1.validate)(updateSchema), updateUserHandler);
router.put('/:id', (0, validate_1.validate)(updateSchema), updateUserHandler);
router.put('/:id/permissions', (0, validate_1.validate)(permissionsSchema), async (req, res, next) => {
    try {
        if (!requireAccess(req, res, 'PERMISSION_MANAGE'))
            return;
        const permissions = normalizePermissionMap(req.body.permissions);
        const selectedPermissionKeys = permissionMapToKeys(permissions);
        const user = await User_1.User.findOne({ _id: req.params.id, isDeleted: false });
        if (!user)
            return res.status(404).json((0, response_1.createError)('User not found'));
        user.permissions = permissions;
        user.permissionKeys = selectedPermissionKeys;
        user.revokedPermissionKeys = systemMasterRules_1.enterprisePermissions.filter((permission) => !selectedPermissionKeys.includes(permission));
        await user.save();
        const current = await User_1.User.findOne({ _id: req.params.id, isDeleted: false }).select('-password').lean();
        res.json((0, response_1.createResponse)(serializeUser(current), 'User permissions updated'));
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        if (!requireAccess(req, res, 'USER_DELETE'))
            return;
        const user = await User_1.User.findByIdAndDelete(req.params.id).lean();
        if (!user)
            return res.status(404).json((0, response_1.createError)('User not found'));
        res.json((0, response_1.createResponse)({}, 'User deleted'));
    }
    catch (error) {
        next(error);
    }
});
exports.userRouter = router;
