"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Salary = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const salarySchema = (0, schema_1.createBaseSchema)({
    employeeId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    monthKey: { type: String, required: true, trim: true, index: true },
    baseAmount: { type: Number, required: true },
    deductions: { type: Number, default: 0 },
    deductionsDetail: [{ reason: { type: String, trim: true }, amount: { type: Number, default: 0 } }],
    netAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    currency: { type: String, default: 'AFN', trim: true },
    approvedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    immutableRecord: { type: Boolean, default: true },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'salaries' });
salarySchema.index({ employeeId: 1, monthKey: 1 }, { unique: true });
exports.Salary = mongoose_1.default.models.Salary ?? mongoose_1.default.model('Salary', salarySchema);
