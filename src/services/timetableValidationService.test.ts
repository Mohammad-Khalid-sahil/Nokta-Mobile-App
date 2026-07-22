import assert from 'node:assert/strict';
import { hasTimeConflict, subjectBelongsToClass, teacherCanTeachClassSubject } from './timetableValidationService';

assert.equal(hasTimeConflict('08:00', '09:00', '08:30', '09:30'), true, 'partial overlap should conflict');
assert.equal(hasTimeConflict('08:00', '09:00', '07:30', '08:15'), true, 'early partial overlap should conflict');
assert.equal(hasTimeConflict('08:00', '09:00', '08:00', '09:00'), true, 'same slot should conflict');
assert.equal(hasTimeConflict('08:00', '09:00', '07:00', '08:00'), false, 'touching end/start is allowed');
assert.equal(hasTimeConflict('08:00', '09:00', '09:00', '10:00'), false, 'touching start/end is allowed');

const klass = { _id: 'class-a', assignedSubjects: ['subject-a'], assignedTeachers: ['teacher-a'] };
const subject = { _id: 'subject-a', classId: 'class-a', classIds: [] };
const multiClassSubject = { _id: 'subject-b', classIds: ['class-a'] };
const foreignSubject = { _id: 'subject-c', classId: 'class-b', classIds: [] };
const teacher = { _id: 'teacher-a', assignedClasses: ['class-a'], assignedSubjects: ['subject-a'] };

assert.equal(subjectBelongsToClass(subject, klass), true, 'subject.classId should link subject to class');
assert.equal(subjectBelongsToClass(multiClassSubject, klass), true, 'subject.classIds should link subject to class');
assert.equal(subjectBelongsToClass(foreignSubject, klass), false, 'foreign subject should be rejected for class');
assert.equal(
  subjectBelongsToClass({ _id: 'subject-d' }, { _id: 'class-a', subjectId: 'subject-d', assignedSubjects: [] }),
  true,
  'class.subjectId should link subject to class'
);
assert.equal(teacherCanTeachClassSubject(teacher, klass, subject), true, 'teacher assigned to class and subject can teach');
assert.equal(
  teacherCanTeachClassSubject(
    { _id: 'teacher-c', assignedClasses: [], assignedSubjects: [] },
    { _id: 'class-a', teacherId: 'teacher-c', assignedSubjects: ['subject-a'], assignedTeachers: [] },
    subject
  ),
  true,
  'class primary teacher should be allowed'
);
assert.equal(teacherCanTeachClassSubject({ _id: 'teacher-b', assignedClasses: [], assignedSubjects: [] }, klass, subject), false, 'unassigned teacher should be rejected');

assert.throws(() => hasTimeConflict('09:00', '08:00', '08:00', '09:00'), /End time must be after start time/, 'invalid lesson window should fail');

console.log('timetable validation tests passed');
