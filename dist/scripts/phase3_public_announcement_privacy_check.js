"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const publicAnnouncementsService_1 = require("../services/publicAnnouncementsService");
function test(name, fn) {
    try {
        fn();
        console.log(`ok - ${name}`);
    }
    catch (error) {
        console.error(`fail - ${name}`);
        throw error;
    }
}
test('public filter requires isPublic and empty audience', () => {
    const filter = (0, publicAnnouncementsService_1.buildPublicAnnouncementFilter)();
    strict_1.default.equal(filter.isPublic, true);
    strict_1.default.equal(filter.visibility, 'public');
    strict_1.default.equal(filter.publishStatus, 'published');
    strict_1.default.ok(Array.isArray(filter.$and));
});
test('targeted notifications cannot be marked public', () => {
    const flags = (0, publicAnnouncementsService_1.resolvePublicVisibilityFlags)({
        isPublic: true,
        visibility: 'public',
        recipientRoles: ['student'],
        recipientIds: []
    });
    strict_1.default.equal(flags.isPublic, false);
    strict_1.default.equal(flags.visibility, 'private');
});
test('empty-audience explicit public is allowed', () => {
    const flags = (0, publicAnnouncementsService_1.resolvePublicVisibilityFlags)({
        isPublic: true,
        visibility: 'public',
        recipientRoles: [],
        recipientIds: []
    });
    strict_1.default.equal(flags.isPublic, true);
    strict_1.default.equal(flags.visibility, 'public');
});
test('serializePublicAnnouncement strips personal metadata and audience', () => {
    const payload = (0, publicAnnouncementsService_1.serializePublicAnnouncement)({
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
    }, 'en');
    strict_1.default.equal(payload.isPublic, true);
    strict_1.default.deepEqual(payload.recipientRoles, []);
    strict_1.default.deepEqual(payload.recipientIds, []);
    strict_1.default.deepEqual(payload.readBy, []);
    strict_1.default.equal(payload.metadata.studentId, undefined);
    strict_1.default.equal(payload.metadata.daysRemaining, undefined);
    strict_1.default.equal(payload.metadata.announcementType, 'holiday');
    strict_1.default.equal(payload.severity, 'info');
});
test('lifecycle blocked alert is not structurally public', () => {
    strict_1.default.equal((0, publicAnnouncementsService_1.isStructurallyPublicNotification)({
        isDeleted: false,
        publishStatus: 'published',
        isPublic: false,
        visibility: 'private',
        recipientRoles: ['student', 'parent'],
        recipientIds: [],
        category: 'academic_reminder',
        metadata: { studentId: 'abc' }
    }), false);
});
console.log('phase3 public announcement privacy checks passed');
