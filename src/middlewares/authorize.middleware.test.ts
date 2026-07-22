import { authorize } from './auth';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function runAuthorize(allowedRoles: string[], user: { role: string; userId?: string; branchId?: string | null } | null) {
  let status = 200;
  const req = {
    user,
    originalUrl: '/api/branches',
    method: 'DELETE',
    ip: '127.0.0.1',
    get: () => ''
  } as any;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json() {
      return res;
    }
  } as any;
  let nextCalled = false;
  authorize(allowedRoles)(req, res, () => {
    nextCalled = true;
  });
  return { status, nextCalled };
}

assert(runAuthorize(['super_admin'], { role: 'student' }).status === 403, 'student denied for super_admin-only route');
assert(runAuthorize(['super_admin'], { role: 'super_admin' }).nextCalled, 'super_admin bypasses strict role list');
assert(runAuthorize(['admin', 'teacher'], { role: 'admin' }).nextCalled, 'admin allowed when listed');
assert(!runAuthorize(['admin', 'teacher'], { role: 'student' }).nextCalled, 'student cannot bypass strict roles');
assert(runAuthorize(['admin', 'teacher'], { role: 'student' }).status === 403, 'student gets 403 for strict roles');

console.log('authorize middleware tests passed');
