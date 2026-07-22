import { Router } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { Branch } from '../../models/Branch';
import { Owner } from '../../models/Owner';
import { User } from '../../models/User';
import { afghanPhoneField } from '../../validators/fieldSchemas';
import { listRecordFilter } from '../../utils/recordVisibility';

const router = Router();
const idParamSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  })
});

const branchSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().required(),
    code: Joi.string().uppercase().required(),
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    country: Joi.string().optional(),
    phone: afghanPhoneField(false),
    email: Joi.string().email().optional(),
    ownerId: Joi.string().hex().length(24).optional(),
    managerId: Joi.string().hex().length(24).optional()
  })
});

const branchUpdateSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().optional(),
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    country: Joi.string().optional(),
    phone: afghanPhoneField(false),
    email: Joi.string().email().optional(),
    ownerId: Joi.string().hex().length(24).optional(),
    managerId: Joi.string().hex().length(24).optional(),
    active: Joi.boolean().optional()
  }).min(1)
});

router.use(authenticate);

function assertBranchManagerOwnsBranch(req: any, branch: { _id?: { toString?: () => string } } | null) {
  const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
  if (role !== 'branch_manager') {
    return null;
  }

  const userBranchId = req.user?.branchId?.toString?.() ?? null;
  const targetBranchId = branch?._id?.toString?.() ?? req.params?.id?.toString?.() ?? null;
  if (!userBranchId || !targetBranchId || userBranchId !== targetBranchId) {
    return createError('Branch access denied');
  }

  return null;
}

router.get('/manager-options', authorize(['super_admin', 'owner', 'branch_manager']), async (_req, res, next) => {
  try {
    const managers = await User.find({
      role: { $in: ['branch_manager', 'admin', 'super_admin'] },
      isDeleted: false,
      status: 'active'
    })
      .select('name email phone role')
      .sort({ name: 1 })
      .lean();

    res.json(createResponse(managers));
  } catch (error) {
    next(error);
  }
});

router.get('/', authorize(['super_admin', 'owner', 'branch_manager']), async (req, res, next) => {
  try {
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    const filter: Record<string, unknown> = { ...listRecordFilter(req.user) };
    if (role === 'branch_manager' && req.user?.branchId) {
      filter._id = req.user.branchId;
    }

    const branches = await Branch.find(filter)
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

    res.json(createResponse(branches.map((branch: any) => ({
      ...branch,
      managerName: branch.managerId?.name ?? '',
      managerEmail: branch.managerId?.email ?? '',
      ownerName: branch.ownerId?.userId?.name ?? '',
      ownerEmail: branch.ownerId?.userId?.email ?? '',
      ownerTitle: branch.ownerId?.title ?? 'Owner'
    }))));
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize(['super_admin']), validate(branchSchema), async (req, res, next) => {
  try {
    if (req.body.ownerId) {
      const owner = await Owner.findOne({ _id: req.body.ownerId, isDeleted: false }).lean();
      if (!owner) {
        return res.status(400).json(createError('Selected owner is invalid'));
      }
    }

    if (req.body.managerId) {
      const manager = await User.findOne({
        _id: req.body.managerId,
        role: { $in: ['branch_manager', 'admin', 'super_admin'] },
        isDeleted: false
      }).lean();

      if (!manager) {
        return res.status(400).json(createError('Selected branch manager is invalid'));
      }
    }

    const branch = await Branch.create(req.body);
    res.status(201).json(createResponse(branch, 'Branch created successfully'));
  } catch (error) {
    next(error);
  }
});

const updateBranchHandler = async (req: any, res: any, next: any) => {
  try {
    const existingBranch = await Branch.findById(req.params.id).select('_id').lean<any>();
    if (!existingBranch) {
      return res.status(404).json(createError('Branch not found'));
    }

    const branchScopeError = assertBranchManagerOwnsBranch(req, existingBranch);
    if (branchScopeError) {
      return res.status(403).json(branchScopeError);
    }

    if (req.body.ownerId) {
      const owner = await Owner.findOne({ _id: req.body.ownerId, isDeleted: false }).lean();
      if (!owner) {
        return res.status(400).json(createError('Selected owner is invalid'));
      }
    }

    if (req.body.managerId) {
      const manager = await User.findOne({
        _id: req.body.managerId,
        role: { $in: ['branch_manager', 'admin', 'super_admin'] },
        isDeleted: false
      }).lean();

      if (!manager) {
        return res.status(400).json(createError('Selected branch manager is invalid'));
      }
    }

    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
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
      return res.status(404).json(createError('Branch not found'));
    }
    res.json(createResponse({
      ...branch,
      managerName: (branch as any).managerId?.name ?? '',
      managerEmail: (branch as any).managerId?.email ?? '',
      ownerName: (branch as any).ownerId?.userId?.name ?? '',
      ownerEmail: (branch as any).ownerId?.userId?.email ?? '',
      ownerTitle: (branch as any).ownerId?.title ?? 'Owner'
    }, 'Branch updated successfully'));
  } catch (error) {
    next(error);
  }
};

router.patch('/:id', authorize(['super_admin', 'branch_manager']), validate(branchUpdateSchema), updateBranchHandler);
router.put('/:id', authorize(['super_admin', 'branch_manager']), validate(branchUpdateSchema), updateBranchHandler);

router.post('/:id/request-delete', authorize(['super_admin', 'owner', 'branch_manager']), validate(idParamSchema), async (req, res, next) => {
  try {
    const existingBranch = await Branch.findById(req.params.id).select('_id').lean<any>();
    if (!existingBranch) {
      return res.status(404).json(createError('Branch not found'));
    }

    const branchScopeError = assertBranchManagerOwnsBranch(req, existingBranch);
    if (branchScopeError) {
      return res.status(403).json(branchScopeError);
    }

    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      {
        deleteRequestedAt: new Date(),
        deleteRequestedBy: req.user?.userId ?? null
      },
      { new: true }
    ).lean();

    if (!branch) {
      return res.status(404).json(createError('Branch not found'));
    }

    res.json(createResponse(branch, 'Branch delete request recorded'));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/approve-delete', authorize(['super_admin']), validate(idParamSchema), async (req, res, next) => {
  try {
    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      {
        ownerDeleteApprovedAt: new Date(),
        ownerDeleteApprovedBy: req.user?.userId ?? null
      },
      { new: true }
    ).lean();

    if (!branch) {
      return res.status(404).json(createError('Branch not found'));
    }

    res.json(createResponse(branch, 'Branch delete approval recorded'));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authorize(['super_admin']), validate(idParamSchema), async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json(createError('Branch not found'));
    }

    branch.isDeleted = true;
    branch.deletedAt = new Date();
    branch.deletedBy = req.user?.userId as any;
    branch.active = false;
    await branch.save();

    res.json(createResponse({}, 'Branch deleted successfully'));
  } catch (error) {
    next(error);
  }
});

export const branchRouter = router;
