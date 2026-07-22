"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("./auth");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function runAuthorize(allowedRoles, user) {
    let status = 200;
    const req = {
        user,
        originalUrl: '/api/branches',
        method: 'DELETE',
        ip: '127.0.0.1',
        get: () => ''
    };
    const res = {
        status(code) {
            status = code;
            return res;
        },
        json() {
            return res;
        }
    };
    let nextCalled = false;
    (0, auth_1.authorize)(allowedRoles)(req, res, () => {
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
