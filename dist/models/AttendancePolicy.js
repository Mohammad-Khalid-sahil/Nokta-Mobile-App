"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendancePolicy = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const attendancePolicySchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    name: { type: String, required: true, trim: true },
    duplicateWindowMinutes: { type: Number, default: 720 },
    absenceSuspensionThreshold: { type: Number, default: 5 },
    onlineAutoMarkEnabled: { type: Boolean, default: true },
    minimumSessionDurationMinutes: { type: Number, default: 15, min: 1 },
    minimumSessionDurationPercent: { type: Number, default: 50, min: 1, max: 100 },
    salaryDeductionPerAbsence: { type: Number, default: 50 },
    reminderLeadDays: { type: Number, default: 3 },
    active: { type: Boolean, default: true, index: true }
}, { collection: 'attendance_policies' });
attendancePolicySchema.index({ branchId: 1, active: 1 });
exports.AttendancePolicy = mongoose_1.default.models.AttendancePolicy ?? mongoose_1.default.model('AttendancePolicy', attendancePolicySchema);
