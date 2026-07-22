type VisibilityUser = {
  role?: string | null;
  canonicalRole?: string | null;
};

export function resolveActorRole(user?: VisibilityUser | null) {
  return String(user?.canonicalRole ?? user?.role ?? '').trim();
}

export function isSuperAdminActor(user?: VisibilityUser | null) {
  return resolveActorRole(user) === 'super_admin';
}

export function listRecordFilter(user?: VisibilityUser | null, includeDeleted?: boolean) {
  if (isSuperAdminActor(user) || includeDeleted) {
    return {};
  }

  return { isDeleted: false };
}

export function activeRecordFilter(user?: VisibilityUser | null) {
  return listRecordFilter(user);
}
