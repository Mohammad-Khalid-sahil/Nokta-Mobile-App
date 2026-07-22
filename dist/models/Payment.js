"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Payment = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const paymentSchema = (0, schema_1.createBaseSchema)({
    paymentFor: {
        type: String,
        enum: ['student_fee', 'teacher_salary', 'manager_salary'],
        default: 'student_fee',
        index: true
    },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    payeeUserId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    payeeRole: { type: String, enum: ['teacher', 'manager'], required: false, index: true },
    salaryRecordIds: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'SalaryRecord' }],
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    enrollmentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Enrollment', default: null, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    collectedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    amount: { type: Number, required: true },
    grossAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    remainingSalaryBalance: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['pending', 'completed', 'paid', 'cancelled', 'refunded'],
        default: 'completed',
        index: true
    },
    currency: { type: String, default: 'AFN', trim: true },
    paymentDate: { type: Date, default: Date.now, index: true },
    method: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'card'], default: 'cash' },
    invoiceNumber: { type: String, required: true, trim: true, unique: true, index: true },
    referenceNumber: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    immutableRecord: { type: Boolean, default: true },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'payments' });
paymentSchema.index({ studentId: 1, paymentDate: -1 });
paymentSchema.index({ referenceNumber: 1 }, { sparse: true });
paymentSchema.index({ invoiceNumber: 1 }, { unique: true });
exports.Payment = mongoose_1.default.models.Payment ?? mongoose_1.default.model('Payment', paymentSchema);
