import mongoose from 'mongoose';
import { Notification } from '../models/Notification';
import { resolveLocalizedText } from '../utils/localizedText';

/** Categories that must never appear on the public academy feed. */
export const PRIVATE_NOTIFICATION_CATEGORIES = [
  'academic_reminder'
] as const;

/** Metadata keys that indicate a personal / user-scoped notification. */
const PRIVATE_METADATA_KEYS = [
  'studentId',
  'userId',
  'targetUserId',
  'privateRecipientId',
  'parentId',
  'accountStatus',
  'daysRemaining'
] as const;

let didBackfillPublicFlags = false;

function emptyAudienceClause(field: 'recipientRoles' | 'recipientIds') {
  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: { $size: 0 } },
      { [field]: null }
    ]
  };
}

/**
 * Database filter for public academy announcements.
 * Default is private: only explicit public records pass.
 */
export function buildPublicAnnouncementFilter(search = '') {
  const now = new Date();
  const filter: Record<string, unknown> = {
    isDeleted: false,
    publishStatus: 'published',
    isPublic: true,
    visibility: 'public',
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      {
        $or: [
          { publishDate: null },
          { publishDate: { $exists: false } },
          { publishDate: { $lte: now } }
        ]
      },
      emptyAudienceClause('recipientRoles'),
      emptyAudienceClause('recipientIds'),
      { category: { $nin: [...PRIVATE_NOTIFICATION_CATEGORIES] } },
      ...PRIVATE_METADATA_KEYS.map((key) => ({
        [`metadata.${key}`]: { $exists: false }
      }))
    ]
  };

  const trimmed = String(search || '').trim();
  if (trimmed) {
    const searchFilter = {
      $or: [
        { title: { $regex: trimmed, $options: 'i' } },
        { description: { $regex: trimmed, $options: 'i' } },
        { message: { $regex: trimmed, $options: 'i' } }
      ]
    };
    (filter.$and as unknown[]).push(searchFilter);
  }

  return filter;
}

/**
 * One-time structural backfill:
 * - Mark clearly personal records as private
 * - Promote only structurally safe legacy broadcasts to public
 */
export async function ensurePublicAnnouncementFlagsBackfilled() {
  if (didBackfillPublicFlags) return;
  didBackfillPublicFlags = true;

  try {
    await Notification.updateMany(
      {
        isDeleted: false,
        $or: [
          { recipientIds: { $exists: true, $not: { $size: 0 } } },
          { recipientRoles: { $exists: true, $not: { $size: 0 } } },
          { 'metadata.studentId': { $exists: true } },
          { 'metadata.userId': { $exists: true } },
          { 'metadata.targetUserId': { $exists: true } },
          { category: { $in: [...PRIVATE_NOTIFICATION_CATEGORIES] } }
        ]
      },
      { $set: { isPublic: false, visibility: 'private' } }
    );

    await Notification.updateMany(
      {
        isDeleted: false,
        publishStatus: 'published',
        isPublic: { $ne: true },
        visibility: { $nin: ['private', 'internal'] },
        category: { $nin: [...PRIVATE_NOTIFICATION_CATEGORIES] },
        'metadata.studentId': { $exists: false },
        'metadata.userId': { $exists: false },
        'metadata.targetUserId': { $exists: false },
        $and: [emptyAudienceClause('recipientRoles'), emptyAudienceClause('recipientIds')]
      },
      { $set: { isPublic: true, visibility: 'public' } }
    );
  } catch {
    // Do not block public reads if backfill fails; query still requires isPublic:true.
    didBackfillPublicFlags = false;
  }
}

function sanitizePublicMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const source = metadata as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (PRIVATE_METADATA_KEYS.includes(key as (typeof PRIVATE_METADATA_KEYS)[number])) {
      continue;
    }
    const lowered = key.toLowerCase();
    if (
      lowered.includes('student') ||
      lowered.includes('userid') ||
      lowered.includes('recipient') ||
      lowered.includes('password') ||
      lowered.includes('token')
    ) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

/** Public-safe serialization — never leaks audience or personal metadata. */
export function serializePublicAnnouncement(notification: any, lang = 'en') {
  const classRef = notification?.classId;
  const subjectRef = notification?.subjectId;
  const teacherRef = notification?.teacherId;
  const metadata = sanitizePublicMetadata(notification?.metadata);
  const title = resolveLocalizedText(notification?.title, lang);
  const description = resolveLocalizedText(
    notification?.description ?? notification?.message,
    lang
  );
  const shortDescription = resolveLocalizedText(
    metadata.shortDescription ?? notification?.shortDescription,
    lang
  );
  const imageUrl =
    metadata.imageUrl ||
    metadata.image ||
    metadata.coverImage ||
    notification?.imageUrl ||
    notification?.image ||
    '';
  const link =
    metadata.link ||
    metadata.url ||
    metadata.attachmentUrl ||
    metadata.fileUrl ||
    notification?.link ||
    '';
  const announcementType =
    metadata.announcementType ||
    metadata.type ||
    metadata.kind ||
    notification?.announcementType ||
    notification?.kind ||
    '';
  const courseId = metadata.courseId || notification?.courseId || null;
  const attachments = Array.isArray(metadata.attachments)
    ? metadata.attachments
    : Array.isArray(notification?.attachments)
      ? notification.attachments
      : [];

  return {
    _id: notification?._id ? String(notification._id) : undefined,
    id: notification?._id ? String(notification._id) : undefined,
    catalogType: 'public_announcement',
    isPublic: true,
    visibility: 'public',
    title,
    shortDescription,
    description,
    message: description,
    fullDescription: description,
    titleLocalized: notification?.title,
    descriptionLocalized: notification?.description ?? notification?.message,
    category: notification?.category ?? 'general',
    type: announcementType || notification?.category || 'general',
    announcementType: announcementType || undefined,
    kind: announcementType || undefined,
    priority: notification?.priority ?? 'normal',
    severity: notification?.severity === 'critical' ? 'info' : (notification?.severity ?? 'info'),
    pinned: Boolean(notification?.pinned),
    publishStatus: 'published',
    publishDate: notification?.publishDate ?? notification?.createdAt ?? null,
    createdAt: notification?.createdAt ?? notification?.publishDate ?? null,
    updatedAt: notification?.updatedAt ?? null,
    expiresAt: notification?.expiresAt ?? null,
    expireDate: notification?.expiresAt ?? null,
    image: imageUrl || undefined,
    imageUrl: imageUrl || undefined,
    link: link || undefined,
    attachment: link || undefined,
    attachments,
    classId: classRef?._id ?? classRef ?? null,
    courseId: courseId ? String(courseId) : null,
    subjectId: subjectRef?._id ?? subjectRef ?? null,
    teacherId: teacherRef?._id ?? teacherRef ?? null,
    className: classRef?.className ?? classRef?.name ?? '',
    classCode: classRef?.classCode ?? '',
    subjectName: subjectRef?.title ?? '',
    teacherName: teacherRef?.name ?? '',
    metadata,
    // Explicitly omit private fields
    recipientRoles: [],
    recipientIds: [],
    readBy: []
  };
}

export async function listPublicAnnouncements(options: {
  page?: number;
  limit?: number;
  search?: string;
  lang?: string;
} = {}) {
  await ensurePublicAnnouncementFlagsBackfilled();

  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
  const lang = options.lang === 'fa' || options.lang === 'ps' ? options.lang : 'en';
  const filter = buildPublicAnnouncementFilter(options.search);

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email')
      .lean()
      .sort({ pinned: -1, priority: -1, publishDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter)
  ]);

  // Stable ID dedupe (defense against duplicate documents)
  const seen = new Set<string>();
  const items = [];
  for (const item of notifications) {
    const id = String((item as any)?._id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push(serializePublicAnnouncement(item, lang));
  }

  return { items, page, limit, total };
}

export function isStructurallyPublicNotification(doc: any): boolean {
  if (!doc || doc.isDeleted) return false;
  if (doc.publishStatus !== 'published') return false;
  if (doc.isPublic !== true) return false;
  if (String(doc.visibility || '') !== 'public') return false;

  const roles = Array.isArray(doc.recipientRoles) ? doc.recipientRoles : [];
  const ids = Array.isArray(doc.recipientIds) ? doc.recipientIds : [];
  if (roles.length > 0 || ids.length > 0) return false;

  if (PRIVATE_NOTIFICATION_CATEGORIES.includes(doc.category)) return false;

  const metadata = doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {};
  for (const key of PRIVATE_METADATA_KEYS) {
    if (metadata[key] != null && metadata[key] !== '') return false;
  }

  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) return false;
  if (doc.publishDate && new Date(doc.publishDate).getTime() > Date.now()) return false;

  return true;
}

export function resolvePublicVisibilityFlags(input: {
  isPublic?: unknown;
  visibility?: unknown;
  recipientRoles?: unknown[];
  recipientIds?: unknown[];
}) {
  const roles = Array.isArray(input.recipientRoles) ? input.recipientRoles.filter(Boolean) : [];
  const ids = Array.isArray(input.recipientIds) ? input.recipientIds.filter(Boolean) : [];
  const requestedPublic =
    input.isPublic === true ||
    String(input.visibility || '').toLowerCase() === 'public';

  // Targeted notifications can never be public.
  if (roles.length > 0 || ids.length > 0) {
    return { isPublic: false, visibility: 'private' as const };
  }

  if (requestedPublic) {
    return { isPublic: true, visibility: 'public' as const };
  }

  return { isPublic: false, visibility: 'private' as const };
}

export function toObjectIdList(values: unknown[]): mongoose.Types.ObjectId[] {
  return values
    .map((value) => String(value))
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}
