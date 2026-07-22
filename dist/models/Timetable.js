"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timetable = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const timetableSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6, required: true, index: true },
    startTime: { type: String, required: true, trim: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, trim: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    durationMinutes: { type: Number, min: 1, default: 0 },
    room: { type: String, trim: true, default: '' },
    academicYear: { type: String, trim: true, default: '' },
    semester: { type: String, trim: true, default: '' },
    deliveryMode: { type: String, enum: ['in_person', 'online', 'hybrid'], default: 'in_person' },
    onlineLink: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    active: { type: Boolean, default: true, index: true }
}, { collection: 'timetable' });
timetableSchema.pre('validate', function normalizeTimetable(next) {
    const [startHour, startMinute] = String(this.startTime || '').split(':').map(Number);
    const [endHour, endMinute] = String(this.endTime || '').split(':').map(Number);
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    if (Number.isFinite(startTotal) && Number.isFinite(endTotal) && endTotal > startTotal) {
        this.durationMinutes = endTotal - startTotal;
    }
    this.active = this.isActive !== false;
    next();
});
timetableSchema.index({ classId: 1, dayOfWeek: 1, startTime: 1, endTime: 1 });
timetableSchema.index({ teacherId: 1, dayOfWeek: 1, startTime: 1, endTime: 1 });
timetableSchema.index({ subjectId: 1, dayOfWeek: 1 });
timetableSchema.index({ branchId: 1, dayOfWeek: 1, startTime: 1 });
timetableSchema.index({ room: 1, branchId: 1, dayOfWeek: 1, startTime: 1, endTime: 1 });
exports.Timetable = mongoose_1.default.models.Timetable ?? mongoose_1.default.model('Timetable', timetableSchema);
