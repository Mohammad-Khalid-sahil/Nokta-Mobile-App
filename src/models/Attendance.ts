import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const attendanceSchema = createBaseSchema(
  {
    timetableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', default: null, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    attendeeType: { type: String, enum: ['student', 'teacher'], default: 'student', index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicy', default: null },
    attendanceDate: { type: Date, required: true, index: true },
    checkInAt: { type: Date, default: null, index: true },
    checkOutAt: { type: Date, default: null, index: true },
    durationMinutes: { type: Number, default: null, min: 0 },
    minimumRequiredMinutes: { type: Number, default: null, min: 0 },
    session: { type: String, enum: ['morning', 'afternoon', 'evening', 'online'], default: 'morning' },
    status: { type: String, enum: ['present', 'absent', 'late', 'excused', 'online_auto_marked'], required: true, index: true },
    source: {
      type: String,
      enum: ['manual', 'automation', 'mobile', 'web', 'student_self_checkin', 'teacher_marked', 'admin_marked', 'system_auto_closed'],
      default: 'web'
    },
    sessionStartTime: { type: String, trim: true, default: '' },
    sessionEndTime: { type: String, trim: true, default: '' },
    notes: { type: String, default: '', trim: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'attendance' }
);

attendanceSchema.index({ studentId: 1, attendanceDate: 1, session: 1 }, { unique: true, partialFilterExpression: { studentId: { $type: 'objectId' }, timetableId: null } });
attendanceSchema.index({ timetableId: 1, studentId: 1, attendanceDate: 1 }, { unique: true, partialFilterExpression: { studentId: { $type: 'objectId' }, timetableId: { $type: 'objectId' }, isDeleted: false } });
attendanceSchema.index({ timetableId: 1, userId: 1, attendeeType: 1, attendanceDate: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' }, timetableId: { $type: 'objectId' }, isDeleted: false } });
attendanceSchema.index({ classId: 1, attendanceDate: 1 });
attendanceSchema.index({ subjectId: 1, attendanceDate: 1 });

export const Attendance = mongoose.models.Attendance ?? mongoose.model('Attendance', attendanceSchema);
