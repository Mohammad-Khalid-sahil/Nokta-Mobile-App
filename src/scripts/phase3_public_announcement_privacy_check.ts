import assert from 'node:assert/strict';
import {
  buildPublicAnnouncementFilter,
  isStructurallyPublicNotification,
  resolvePublicVisibilityFlags,
  serializePublicAnnouncement
} from '../services/publicAnnouncementsService';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test('public filter requires isPublic and empty audience', () => {
  const filter = buildPublicAnnouncementFilter() as any;
  assert.equal(filter.isPublic, true);
  assert.equal(filter.visibility, 'public');
  assert.equal(filter.publishStatus, 'published');
  assert.ok(Array.isArray(filter.$and));
});

test('targeted notifications cannot be marked public', () => {
  const flags = resolvePublicVisibilityFlags({
    isPublic: true,
    visibility: 'public',
    recipientRoles: ['student'],
    recipientIds: []
  });
  assert.equal(flags.isPublic, false);
  assert.equal(flags.visibility, 'private');
});

test('empty-audience explicit public is allowed', () => {
  const flags = resolvePublicVisibilityFlags({
    isPublic: true,
    visibility: 'public',
    recipientRoles: [],
    recipientIds: []
  });
  assert.equal(flags.isPublic, true);
  assert.equal(flags.visibility, 'public');
});

test('serializePublicAnnouncement strips personal metadata and audience', () => {
  const payload = serializePublicAnnouncement(
    {
      _id: '65f000000000000000000001',
      title: 'Eid holiday',
      description: 'Academy closed',
      publishStatus: 'published',
      isPublic: true,
      visibility: 'public',
      recipientRoles: ['student'],
      recipientIds: ['65f000000000000000000099'],
      readBy: ['65f000000000000000000099'],
      metadata: {
        studentId: 'secret',
        announcementType: 'holiday',
        daysRemaining: 3
      },
      severity: 'critical'
    },
    'en'
  );

  assert.equal(payload.isPublic, true);
  assert.deepEqual(payload.recipientRoles, []);
  assert.deepEqual(payload.recipientIds, []);
  assert.deepEqual(payload.readBy, []);
  assert.equal((payload.metadata as any).studentId, undefined);
  assert.equal((payload.metadata as any).daysRemaining, undefined);
  assert.equal((payload.metadata as any).announcementType, 'holiday');
  assert.equal(payload.severity, 'info');
});

test('lifecycle blocked alert is not structurally public', () => {
  assert.equal(
    isStructurallyPublicNotification({
      isDeleted: false,
      publishStatus: 'published',
      isPublic: false,
      visibility: 'private',
      recipientRoles: ['student', 'parent'],
      recipientIds: [],
      category: 'academic_reminder',
      metadata: { studentId: 'abc' }
    }),
    false
  );
});

console.log('phase3 public announcement privacy checks passed');
