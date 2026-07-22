import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { createResponse } from '../../helpers/response';
import { enterprisePermissions, rolePermissionMatrix } from '../../config/systemMasterRules';
import { Permission } from '../../models/Permission';

const router = Router();

router.use(authenticate, authorize(['super_admin', 'owner']));

function parsePermission(permission: string) {
  const segments = permission.toLowerCase().split('_');
  const action = segments.pop() ?? 'view';
  const module = segments.join('_');

  return { key: permission, module, action };
}

router.get('/template', (_req, res) => {
  const groupedModules = enterprisePermissions.reduce<Record<string, Set<string>>>((acc, permission) => {
    const { module, action } = parsePermission(permission);
    if (!acc[module]) {
      acc[module] = new Set<string>();
    }
    acc[module].add(action);
    return acc;
  }, {});

  const modules = Object.entries(groupedModules).map(([key, actions]) => ({
    key,
    label: key,
    actions: Array.from(actions).sort()
  }));

  const roleTemplates = Object.entries(rolePermissionMatrix).reduce<Record<string, Record<string, string[]>>>((acc, [role, permissions]) => {
    if (permissions[0] === '*') {
      acc[role] = modules.reduce<Record<string, string[]>>((moduleAcc, module) => {
        moduleAcc[module.key] = [...module.actions];
        return moduleAcc;
      }, {});
      return acc;
    }

    acc[role] = (permissions as string[]).reduce<Record<string, string[]>>((moduleAcc, permission) => {
      const { module, action } = parsePermission(permission);
      moduleAcc[module] = Array.from(new Set([...(moduleAcc[module] ?? []), action])).sort();
      return moduleAcc;
    }, {});

    return acc;
  }, {});

  res.json(createResponse({
    modules,
    roleTemplates
  }));
});

router.get('/', async (_req, res, next) => {
  try {
    const permissions = await Permission.find({ isDeleted: false }).sort({ module: 1, action: 1 }).lean();
    if (permissions.length) {
      return res.json(createResponse(permissions));
    }

    res.json(createResponse(enterprisePermissions.map(parsePermission)));
  } catch (error) {
    next(error);
  }
});

export const permissionsRouter = router;
