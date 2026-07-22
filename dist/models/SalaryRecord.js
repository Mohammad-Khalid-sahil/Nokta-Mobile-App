"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalaryRecord = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const salaryRecordSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['teacher', 'admin', 'manager'], required: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    hijriYear: { type: Number, required: true, index: true },
    hijriMonth: { type: Number, required: true, min: 1, max: 12, index: true },
    grossSalary: { type: Number, required: true, min: 0 },
    fixedAmount: { type: Number, default: 0, min: 0 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    totalStudentPaymentsUsed: { type: Number, default: 0, min: 0 },
    percentageUsed: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, required: true, min: 0 },
    netSalary: { type: Number, required: true, min: 0 },
    taxCategory: { type: String, required: true, trim: true },
    taxExplanation: { type: String, required: true, trim: true },
    taxFormula: { type: String, required: true, trim: true },
    isTaxExempt: { type: Boolean, default: false },
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid', index: true },
    paidAmount: { type: Number, default: 0, min: 0 },
    taxStatus: { type: String, enum: ['pending', 'submitted', 'paid'], default: 'pending', index: true },
    calculatedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'salary_records' });
salaryRecordSchema.index({ userId: 1, hijriYear: 1, hijriMonth: 1 }, { unique: true });
salaryRecordSchema.index({ role: 1, branchId: 1, hijriYear: 1, hijriMonth: 1 });
exports.SalaryRecord = mongoose_1.default.models.SalaryRecord ?? mongoose_1.default.model('SalaryRecord', salaryRecordSchema);
