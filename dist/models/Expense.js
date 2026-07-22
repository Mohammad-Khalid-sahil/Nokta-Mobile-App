"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Expense = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const expenseSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true, trim: true, index: true },
    date: { type: Date, default: Date.now, index: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '', trim: true },
    immutableRecord: { type: Boolean, default: true },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'expenses' });
expenseSchema.index({ date: -1, branchId: 1 });
exports.Expense = mongoose_1.default.models.Expense ?? mongoose_1.default.model('Expense', expenseSchema);
