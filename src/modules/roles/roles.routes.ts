import { Router } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { Branch } from '../../models/Branch';
import { Role } from '../../models/Role';
import { User } from '../../models/User';
import { enterprisePermissions, enterpriseRoles } from '../../config/systemMasterRules';
import { RoleProfileService } from '../../services/roleProfileService';

const router = Router();
const roleProfileService = new RoleProfileService();
const roleScopes = ['global', 'operational', 'instructional', 'self', 'linked-family', 'governance', 'branch', 'service'] as const;

const createRoleSchema = Joi.object({
  body: Joi.object({
    slug: Joi.string().valid(...enterpriseRoles).required(),
    name: Joi.string().trim().required(),
    description: Joi.string().allow('', null).optional(),
    scope: Joi.string().valid(...roleScopes).required(),
    permissionKeys: Joi.array().items(Joi.string().valid(...enterprisePermissions)).min(1).required()
  })
});

const updateRoleSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().trim().optional(),
    description: Joi.string().allow('', null).optional(),
    scope: Joi.string().valid(...roleScopes).optional(),
    permissionKeys: Joi.array().items(Joi.string().valid(...enterprisePermissions)).min(1).optional()
  }).min(1)
});

router.use(authenticate, authorize(['super_admin', 'owner']));

function toTitleCase(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function parsePermission(permission: string) {
  const segments = permission.toLowerCase().split('_');
  const action = segments.pop() ?? 'view';

  return {
    key: permission,
    module: segments.join('_'),
    action
  };
}

async function buildRoleSummary(slug: typeof enterpriseRoles[number]) {
  const [roleDoc, totalBranches] = await Promise.all([
    Role.findOne({ slug, isDeleted: false }).lean<Record<string, any>>(),
    Branch.countDocuments({ isDeleted: false })
  ]);

  const acceptedRoles = roleProfileService.getAcceptedRoles(slug);
  const [userCount, distinctBranches] = await Promise.all([
    User.countDocuments({ role: { $in: acceptedRoles }, isDeleted: false }),
    User.distinct('branchId', { role: { $in: acceptedRoles }, branchId: { $ne: null }, isDeleted: false })
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
    const roles = await Promise.all(enterpriseRoles.map((slug) => buildRoleSummary(slug)));
    res.json(createResponse(roles));
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(createRoleSchema), async (req, res, next) => {
  try {
    const slug = req.body.slug as typeof enterpriseRoles[number];
    const existingRole = await Role.findOne({ slug, isDeleted: false }).lean();
    if (existingRole) {
      return res.status(409).json(createError('Role customization already exists for this slug'));
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

    const archivedRole = await Role.findOne({ slug }).sort({ updatedAt: -1 });
    if (archivedRole) {
      archivedRole.set(payload);
      archivedRole.set('isDeleted', false);
      await archivedRole.save();
    } else {
      await Role.create(payload);
    }

    res.status(201).json(createResponse(await buildRoleSummary(slug), 'Role customization created successfully'));
  } catch (error) {
    next(error);
  }
});

router.put('/:slug', validate(updateRoleSchema), async (req, res, next) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    if (!(enterpriseRoles as readonly string[]).includes(slug)) {
      return res.status(400).json(createError('Unsupported role slug'));
    }

    const roleDoc = await Role.findOne({ slug, isDeleted: false });
    if (!roleDoc) {
      return res.status(404).json(createError('Role customization not found'));
    }

    roleDoc.name = String(req.body.name ?? roleDoc.name).trim();
    roleDoc.description = String(req.body.description ?? roleDoc.description ?? '').trim();
    roleDoc.scope = req.body.scope ?? roleDoc.scope;
    if (req.body.permissionKeys) {
      roleDoc.permissionKeys = roleProfileService.normalizePermissionKeys(slug as typeof enterpriseRoles[number], req.body.permissionKeys);
    }

    await roleDoc.save();

    res.json(createResponse(await buildRoleSummary(slug as typeof enterpriseRoles[number]), 'Role customization updated successfully'));
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    if (!(enterpriseRoles as readonly string[]).includes(slug)) {
      return res.status(400).json(createError('Unsupported role slug'));
    }

    const roleDoc = await Role.findOne({ slug, isDeleted: false });
    if (!roleDoc) {
      return res.status(404).json(createError('Role customization not found'));
    }

    roleDoc.set('isDeleted', true);
    await roleDoc.save();

    res.json(createResponse(await buildRoleSummary(slug as typeof enterpriseRoles[number]), 'Role customization removed. Default permissions restored.'));
  } catch (error) {
    next(error);
  }
});

export const roleRouter = router;
