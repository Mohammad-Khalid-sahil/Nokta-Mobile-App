"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveActorRole = resolveActorRole;
exports.isSuperAdminActor = isSuperAdminActor;
exports.listRecordFilter = listRecordFilter;
exports.activeRecordFilter = activeRecordFilter;
function resolveActorRole(user) {
    return String(user?.canonicalRole ?? user?.role ?? '').trim();
}
function isSuperAdminActor(user) {
    return resolveActorRole(user) === 'super_admin';
}
function listRecordFilter(user, includeDeleted) {
    if (isSuperAdminActor(user) || includeDeleted) {
        return {};
    }
    return { isDeleted: false };
}
function activeRecordFilter(user) {
    return listRecordFilter(user);
}
