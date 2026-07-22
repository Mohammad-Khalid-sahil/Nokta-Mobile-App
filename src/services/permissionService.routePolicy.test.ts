import { PermissionService } from './permissionService';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const permissionService = new PermissionService();

const generatePolicy = permissionService.getRoutePolicy('/api/ai-results/generate/000000000000000000000001', 'POST');
assert(Boolean(generatePolicy), 'generate route policy exists');
assert(Boolean(generatePolicy?.permissions?.includes('AI_RESULT_GENERATE')), 'generate route requires AI_RESULT_GENERATE');
assert(
  !permissionService.hasRequiredAccess({ role: 'student' }, generatePolicy!),
  'student cannot access AI generate route policy'
);
assert(
  !permissionService.hasRequiredAccess({ role: 'parent' }, generatePolicy!),
  'parent cannot access AI generate route policy'
);
assert(
  permissionService.hasRequiredAccess({ role: 'admin' }, generatePolicy!),
  'admin can access AI generate route policy'
);

const branchDeletePolicy = permissionService.getRoutePolicy('/api/branches/000000000000000000000001', 'DELETE');
assert(Boolean(branchDeletePolicy?.permissions?.includes('BRANCH_DELETE')), 'branch delete policy uses BRANCH_DELETE');
assert(
  !permissionService.hasRequiredAccess({ role: 'admin' }, branchDeletePolicy!),
  'admin cannot delete branches via route policy'
);
assert(
  !permissionService.hasRequiredAccess({ role: 'branch_manager' }, branchDeletePolicy!),
  'branch_manager cannot delete branches via route policy'
);

const branchCreatePolicy = permissionService.getRoutePolicy('/api/branches', 'POST');
assert(Boolean(branchCreatePolicy?.permissions?.includes('BRANCH_CREATE')), 'branch create policy exists');
assert(
  !permissionService.hasRequiredAccess({ role: 'admin' }, branchCreatePolicy!),
  'admin cannot create branches via route policy'
);

console.log('permission route policy tests passed');
