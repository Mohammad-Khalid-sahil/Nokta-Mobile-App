"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Branch_1 = require("../../models/Branch");
const Owner_1 = require("../../models/Owner");
const User_1 = require("../../models/User");
const fieldSchemas_1 = require("../../validators/fieldSchemas");
const recordVisibility_1 = require("../../utils/recordVisibility");
const router = (0, express_1.Router)();
const idParamSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    })
});
const branchSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: joi_1.default.string().required(),
        code: joi_1.default.string().uppercase().required(),
        address: joi_1.default.string().optional(),
        city: joi_1.default.string().optional(),
        country: joi_1.default.string().optional(),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        email: joi_1.default.string().email().optional(),
        ownerId: joi_1.default.string().hex().length(24).optional(),
        managerId: joi_1.default.string().hex().length(24).optional()
    })
});
const branchUpdateSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: joi_1.default.string().optional(),
        address: joi_1.default.string().optional(),
        city: joi_1.default.string().optional(),
        country: joi_1.default.string().optional(),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        email: joi_1.default.string().email().optional(),
        ownerId: joi_1.default.string().hex().length(24).optional(),
        managerId: joi_1.default.string().hex().length(24).optional(),
        active: joi_1.default.boolean().optional()
    }).min(1)
});
router.use(auth_1.authenticate);
function assertBranchManagerOwnsBranch(req, branch) {
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if (role !== 'branch_manager') {
        return null;
    }
    const userBranchId = req.user?.branchId?.toString?.() ?? null;
    const targetBranchId = branch?._id?.toString?.() ?? req.params?.id?.toString?.() ?? null;
    if (!userBranchId || !targetBranchId || userBranchId !== targetBranchId) {
        return (0, response_1.createError)('Branch access denied');
    }
    return null;
}
router.get('/manager-options', (0, auth_1.authorize)(['super_admin', 'owner', 'branch_manager']), async (_req, res, next) => {
    try {
        const managers = await User_1.User.find({
            role: { $in: ['branch_manager', 'admin', 'super_admin'] },
            isDeleted: false,
            status: 'active'
        })
            .select('name email phone role')
            .sort({ name: 1 })
            .lean();
        res.json((0, response_1.createResponse)(managers));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, auth_1.authorize)(['super_admin', 'owner', 'branch_manager']), async (req, res, next) => {
    try {
        const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
        const filter = { ...(0, recordVisibility_1.listRecordFilter)(req.user) };
        if (role === 'branch_manager' && req.user?.branchId) {
            filter._id = req.user.branchId;
        }
        const branches = await Branch_1.Branch.find(filter)
            .populate('managerId', 'name email phone')
            .populate({
            path: 'ownerId',
            select: 'userId title',
            populate: {
                path: 'userId',
                select: 'name email'
            }
        })
            .lean();
        res.json((0, response_1.createResponse)(branches.map((branch) => ({
            ...branch,
            managerName: branch.managerId?.name ?? '',
            managerEmail: branch.managerId?.email ?? '',
            ownerName: branch.ownerId?.userId?.name ?? '',
            ownerEmail: branch.ownerId?.userId?.email ?? '',
            ownerTitle: branch.ownerId?.title ?? 'Owner'
        }))));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', (0, auth_1.authorize)(['super_admin']), (0, validate_1.validate)(branchSchema), async (req, res, next) => {
    try {
        if (req.body.ownerId) {
            const owner = await Owner_1.Owner.findOne({ _id: req.body.ownerId, isDeleted: false }).lean();
            if (!owner) {
                return res.status(400).json((0, response_1.createError)('Selected owner is invalid'));
            }
        }
        if (req.body.managerId) {
            const manager = await User_1.User.findOne({
                _id: req.body.managerId,
                role: { $in: ['branch_manager', 'admin', 'super_admin'] },
                isDeleted: false
            }).lean();
            if (!manager) {
                return res.status(400).json((0, response_1.createError)('Selected branch manager is invalid'));
            }
        }
        const branch = await Branch_1.Branch.create(req.body);
        res.status(201).json((0, response_1.createResponse)(branch, 'Branch created successfully'));
    }
    catch (error) {
        next(error);
    }
});
const updateBranchHandler = async (req, res, next) => {
    try {
        const existingBranch = await Branch_1.Branch.findById(req.params.id).select('_id').lean();
        if (!existingBranch) {
            return res.status(404).json((0, response_1.createError)('Branch not found'));
        }
        const branchScopeError = assertBranchManagerOwnsBranch(req, existingBranch);
        if (branchScopeError) {
            return res.status(403).json(branchScopeError);
        }
        if (req.body.ownerId) {
            const owner = await Owner_1.Owner.findOne({ _id: req.body.ownerId, isDeleted: false }).lean();
            if (!owner) {
                return res.status(400).json((0, response_1.createError)('Selected owner is invalid'));
            }
        }
        if (req.body.managerId) {
            const manager = await User_1.User.findOne({
                _id: req.body.managerId,
                role: { $in: ['branch_manager', 'admin', 'super_admin'] },
                isDeleted: false
            }).lean();
            if (!manager) {
                return res.status(400).json((0, response_1.createError)('Selected branch manager is invalid'));
            }
        }
        const branch = await Branch_1.Branch.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('managerId', 'name email phone')
            .populate({
            path: 'ownerId',
            select: 'userId title',
            populate: {
                path: 'userId',
                select: 'name email'
            }
        })
            .lean();
        if (!branch) {
            return res.status(404).json((0, response_1.createError)('Branch not found'));
        }
        res.json((0, response_1.createResponse)({
            ...branch,
            managerName: branch.managerId?.name ?? '',
            managerEmail: branch.managerId?.email ?? '',
            ownerName: branch.ownerId?.userId?.name ?? '',
            ownerEmail: branch.ownerId?.userId?.email ?? '',
            ownerTitle: branch.ownerId?.title ?? 'Owner'
        }, 'Branch updated successfully'));
    }
    catch (error) {
        next(error);
    }
};
router.patch('/:id', (0, auth_1.authorize)(['super_admin', 'branch_manager']), (0, validate_1.validate)(branchUpdateSchema), updateBranchHandler);
router.put('/:id', (0, auth_1.authorize)(['super_admin', 'branch_manager']), (0, validate_1.validate)(branchUpdateSchema), updateBranchHandler);
router.post('/:id/request-delete', (0, auth_1.authorize)(['super_admin', 'owner', 'branch_manager']), (0, validate_1.validate)(idParamSchema), async (req, res, next) => {
    try {
        const existingBranch = await Branch_1.Branch.findById(req.params.id).select('_id').lean();
        if (!existingBranch) {
            return res.status(404).json((0, response_1.createError)('Branch not found'));
        }
        const branchScopeError = assertBranchManagerOwnsBranch(req, existingBranch);
        if (branchScopeError) {
            return res.status(403).json(branchScopeError);
        }
        const branch = await Branch_1.Branch.findByIdAndUpdate(req.params.id, {
            deleteRequestedAt: new Date(),
            deleteRequestedBy: req.user?.userId ?? null
        }, { new: true }).lean();
        if (!branch) {
            return res.status(404).json((0, response_1.createError)('Branch not found'));
        }
        res.json((0, response_1.createResponse)(branch, 'Branch delete request recorded'));
    }
    catch (error) {
        next(error);
    }
});
router.post('/:id/approve-delete', (0, auth_1.authorize)(['super_admin']), (0, validate_1.validate)(idParamSchema), async (req, res, next) => {
    try {
        const branch = await Branch_1.Branch.findByIdAndUpdate(req.params.id, {
            ownerDeleteApprovedAt: new Date(),
            ownerDeleteApprovedBy: req.user?.userId ?? null
        }, { new: true }).lean();
        if (!branch) {
            return res.status(404).json((0, response_1.createError)('Branch not found'));
        }
        res.json((0, response_1.createResponse)(branch, 'Branch delete approval recorded'));
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', (0, auth_1.authorize)(['super_admin']), (0, validate_1.validate)(idParamSchema), async (req, res, next) => {
    try {
        const branch = await Branch_1.Branch.findById(req.params.id);
        if (!branch) {
            return res.status(404).json((0, response_1.createError)('Branch not found'));
        }
        branch.isDeleted = true;
        branch.deletedAt = new Date();
        branch.deletedBy = req.user?.userId;
        branch.active = false;
        await branch.save();
        res.json((0, response_1.createResponse)({}, 'Branch deleted successfully'));
    }
    catch (error) {
        next(error);
    }
});
exports.branchRouter = router;
