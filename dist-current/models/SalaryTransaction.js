"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalaryTransaction = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const salaryTransactionSchema = new mongoose_1.default.Schema({
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true },
    courseId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Course', default: null },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null },
    paymentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Payment', default: null },
    feeAmount: { type: Number, required: true },
    percentage: { type: Number, required: true },
    earnedAmount: { type: Number, required: true },
    salaryType: { type: String, enum: ['fixed', 'percentage', 'fixed_plus_percentage'], default: 'percentage' },
    paidAt: { type: Date, default: null },
    source: { type: String, enum: ['registration', 'payment', 'manual', 'fixed_monthly'], default: 'registration' },
    month: { type: Number, min: 1, max: 12, default: () => new Date().getMonth() + 1 },
    year: { type: Number, default: () => new Date().getFullYear() },
    status: { type: String, enum: ['pending', 'approved', 'paid', 'cancelled'], default: 'approved' },
    paymentReference: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now }
});
salaryTransactionSchema.index({ teacherId: 1, createdAt: -1 });
salaryTransactionSchema.index({ studentId: 1 });
salaryTransactionSchema.index({ paymentId: 1 }, { unique: true, sparse: true });
salaryTransactionSchema.index({ teacherId: 1, year: 1, month: 1, source: 1 });
exports.SalaryTransaction = mongoose_1.default.models.SalaryTransaction ?? mongoose_1.default.model('SalaryTransaction', salaryTransactionSchema);
